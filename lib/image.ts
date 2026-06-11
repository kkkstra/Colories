import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { fitWithin } from '@/lib/imageDimensions';
import {
  MEAL_PHOTO_DIRECTORY,
  createMealPhotoReference,
  extractMealPhotoReference,
  joinDocumentPhotoUri,
} from '@/lib/photoReference';
import { createLocalId } from '@/lib/security';

const MAX_UPLOAD_EDGE = 1600;
const MAX_THUMBNAIL_EDGE = 360;

export interface PreparedFoodImage {
  uploadDataUri: string;
  thumbnailUri: string;
  width: number;
  height: number;
}

export async function prepareFoodImage(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
): Promise<PreparedFoodImage> {
  const context = ImageManipulator.manipulate(sourceUri);
  const uploadSize = fitWithin(sourceWidth, sourceHeight, MAX_UPLOAD_EDGE);
  if (uploadSize) {
    context.resize(uploadSize);
  }
  let rendered = await context.renderAsync();
  if (!uploadSize) {
    const measuredUploadSize = fitWithin(rendered.width, rendered.height, MAX_UPLOAD_EDGE);
    if (measuredUploadSize) {
      const measuredContext = ImageManipulator.manipulate(sourceUri);
      measuredContext.resize(measuredUploadSize);
      rendered = await measuredContext.renderAsync();
    }
  }
  const uploadImage = await rendered.saveAsync({
    base64: true,
    compress: 0.76,
    format: SaveFormat.JPEG,
  });
  if (!uploadImage.base64) {
    throw new Error('图片编码失败，请重新选择照片。');
  }

  const thumbnailContext = ImageManipulator.manipulate(uploadImage.uri);
  const thumbnailSize = fitWithin(
    uploadImage.width,
    uploadImage.height,
    MAX_THUMBNAIL_EDGE,
  );
  if (thumbnailSize) {
    thumbnailContext.resize(thumbnailSize);
  }
  const thumbnailRef = await thumbnailContext.renderAsync();
  const thumbnail = await thumbnailRef.saveAsync({
    base64: Platform.OS === 'web',
    compress: 0.66,
    format: SaveFormat.JPEG,
  });
  const thumbnailUri =
    Platform.OS === 'web'
      ? toJpegDataUri(thumbnail.base64)
      : await persistThumbnail(thumbnail.uri);

  cleanupTemporaryUri(sourceUri, [thumbnailUri]);
  cleanupTemporaryUri(uploadImage.uri, [sourceUri, thumbnailUri]);
  cleanupTemporaryUri(thumbnail.uri, [sourceUri, uploadImage.uri, thumbnailUri]);

  return {
    uploadDataUri: `data:image/jpeg;base64,${uploadImage.base64}`,
    thumbnailUri,
    width: uploadImage.width,
    height: uploadImage.height,
  };
}

async function persistThumbnail(uri: string): Promise<string> {
  const photosDirectory = new Directory(Paths.document, MEAL_PHOTO_DIRECTORY);
  photosDirectory.create({ idempotent: true, intermediates: true });
  const fileName = `${createLocalId('meal')}.jpg`;
  const persistentThumbnail = new File(photosDirectory, fileName);
  await new File(uri).copy(persistentThumbnail);
  return createMealPhotoReference(fileName);
}

export function resolveStoredPhotoUri(uri: string | undefined): string | undefined {
  if (!uri) {
    return undefined;
  }
  if (
    Platform.OS === 'web' ||
    uri.startsWith('data:') ||
    uri.startsWith('blob:') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://')
  ) {
    return uri;
  }

  const reference = extractMealPhotoReference(uri);
  if (!reference) {
    return uri;
  }
  return joinDocumentPhotoUri(Paths.document.uri, reference);
}

function toJpegDataUri(base64: string | undefined): string {
  if (!base64) {
    throw new Error('缩略图编码失败，请重新选择照片。');
  }
  return `data:image/jpeg;base64,${base64}`;
}

function cleanupTemporaryUri(uri: string, protectedUris: string[]): void {
  if (Platform.OS === 'web') {
    if (uri.startsWith('blob:') && !protectedUris.includes(uri)) {
      URL.revokeObjectURL(uri);
    }
    return;
  }
  if (!uri.startsWith('file://') || protectedUris.includes(uri) || !uri.includes('/cache/')) {
    return;
  }
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Cache cleanup is best effort and should never block saving a meal.
  }
}
