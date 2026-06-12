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
const MAX_STORED_EDGE = 2400;

export interface PreparedFoodImage {
  uploadDataUri: string;
  storedUri: string;
  width: number;
  height: number;
}

export async function createFoodImageUploadDataUri(
  sourceUri: string,
  sourceWidth = 0,
  sourceHeight = 0,
): Promise<string> {
  const uploadImage = await renderUploadImage(sourceUri, sourceWidth, sourceHeight);
  cleanupTemporaryUri(uploadImage.uri, [sourceUri]);
  return toJpegDataUri(uploadImage.base64);
}

export async function prepareFoodImage(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
): Promise<PreparedFoodImage> {
  const uploadImage = await renderUploadImage(sourceUri, sourceWidth, sourceHeight);

  const storedContext = ImageManipulator.manipulate(sourceUri);
  const storedSize = fitWithin(sourceWidth, sourceHeight, MAX_STORED_EDGE);
  if (storedSize) {
    storedContext.resize(storedSize);
  }
  let storedRef = await storedContext.renderAsync();
  if (!storedSize) {
    const measuredStoredSize = fitWithin(storedRef.width, storedRef.height, MAX_STORED_EDGE);
    if (measuredStoredSize) {
      const measuredStoredContext = ImageManipulator.manipulate(sourceUri);
      measuredStoredContext.resize(measuredStoredSize);
      storedRef = await measuredStoredContext.renderAsync();
    }
  }
  const storedImage = await storedRef.saveAsync({
    base64: Platform.OS === 'web',
    compress: 0.94,
    format: SaveFormat.JPEG,
  });
  const storedUri =
    Platform.OS === 'web'
      ? toJpegDataUri(storedImage.base64)
      : await persistMealPhoto(storedImage.uri);

  cleanupTemporaryUri(sourceUri, [storedUri]);
  cleanupTemporaryUri(uploadImage.uri, [sourceUri, storedUri]);
  cleanupTemporaryUri(storedImage.uri, [sourceUri, uploadImage.uri, storedUri]);

  return {
    uploadDataUri: toJpegDataUri(uploadImage.base64),
    storedUri,
    width: storedImage.width,
    height: storedImage.height,
  };
}

async function renderUploadImage(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
) {
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
  return uploadImage;
}

async function persistMealPhoto(uri: string): Promise<string> {
  const photosDirectory = new Directory(Paths.document, MEAL_PHOTO_DIRECTORY);
  photosDirectory.create({ idempotent: true, intermediates: true });
  const fileName = `${createLocalId('meal')}.jpg`;
  const persistentPhoto = new File(photosDirectory, fileName);
  await new File(uri).copy(persistentPhoto);
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

export async function deleteStoredPhoto(uri: string | undefined): Promise<void> {
  if (!uri || Platform.OS === 'web') {
    return;
  }
  const reference = extractMealPhotoReference(uri);
  if (!reference) {
    return;
  }
  try {
    const file = new File(joinDocumentPhotoUri(Paths.document.uri, reference));
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Photo cleanup is best effort. The UI removal should never be blocked by file deletion.
  }
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
