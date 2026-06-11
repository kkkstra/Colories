export const MEAL_PHOTO_DIRECTORY = 'meal-photos';

export function createMealPhotoReference(fileName: string): string {
  return `${MEAL_PHOTO_DIRECTORY}/${sanitizePhotoFileName(fileName)}`;
}

export function normalizeMealPhotoReference(uri: string | undefined): string | undefined {
  if (!uri) {
    return undefined;
  }
  return extractMealPhotoReference(uri) ?? uri;
}

export function extractMealPhotoReference(uri: string): string | undefined {
  const marker = `${MEAL_PHOTO_DIRECTORY}/`;
  if (uri.startsWith(marker)) {
    return sanitizePhotoReference(uri);
  }

  const markerIndex = uri.indexOf(`/${marker}`);
  if (markerIndex === -1) {
    return undefined;
  }
  return sanitizePhotoReference(uri.slice(markerIndex + 1));
}

export function joinDocumentPhotoUri(documentUri: string, reference: string): string {
  const normalizedDocumentUri = documentUri.endsWith('/') ? documentUri : `${documentUri}/`;
  return `${normalizedDocumentUri}${sanitizePhotoReference(reference)}`;
}

function sanitizePhotoReference(reference: string): string {
  const fileName = sanitizePhotoFileName(reference.split('/').pop() ?? '');
  return `${MEAL_PHOTO_DIRECTORY}/${fileName}`;
}

function sanitizePhotoFileName(fileName: string): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
    throw new Error('无效的照片文件名。');
  }
  return safeFileName;
}
