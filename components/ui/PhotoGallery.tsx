import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/Theme';

export interface PhotoGalleryItem {
  uri: string;
  width?: number;
  height?: number;
}

interface Props {
  photos: PhotoGalleryItem[];
  onRemovePhoto?: (index: number) => void;
}

export function PhotoGallery({ photos, onRemovePhoto }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isClosingViewerRef = useRef(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const singlePreviewWidth = Math.max(240, Math.min(680, width - 40));
  const iosViewerTopInset = Platform.OS === 'ios' ? Math.max(insets.top, 44) + 8 : 0;
  const viewerEdges =
    Platform.OS === 'ios'
      ? (['right', 'bottom', 'left'] as const)
      : (['top', 'right', 'bottom', 'left'] as const);

  useEffect(() => {
    if (photos.length === 0) {
      isClosingViewerRef.current = true;
      setSelectedIndex(null);
      return;
    }
    if (selectedIndex === null || selectedIndex < photos.length) {
      return;
    }
    setSelectedIndex(photos.length > 0 ? photos.length - 1 : null);
  }, [photos.length, selectedIndex]);

  const openViewer = (index: number) => {
    isClosingViewerRef.current = false;
    setSelectedIndex(index);
  };

  const closeViewer = () => {
    isClosingViewerRef.current = true;
    setSelectedIndex(null);
  };

  if (photos.length === 0) {
    return null;
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.previewRail}
      >
        {photos.map((photo, index) => (
          <View
            key={`${photo.uri}-${index}`}
            style={[
              styles.previewFrame,
              photos.length === 1 && { width: singlePreviewWidth, height: 250 },
            ]}
          >
            <Pressable
              accessibilityLabel={`查看第 ${index + 1} 张图片`}
              accessibilityRole="imagebutton"
              onPress={() => openViewer(index)}
              style={({ pressed }) => [styles.previewOpenButton, pressed && styles.pressed]}
            >
              <Image source={{ uri: photo.uri }} resizeMode="cover" style={styles.previewImage} />
            </Pressable>
            {photos.length > 1 ? (
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeText}>{index + 1}</Text>
              </View>
            ) : null}
            {onRemovePhoto ? (
              <Pressable
                accessibilityLabel={`删除第 ${index + 1} 张图片`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => onRemovePhoto(index)}
                style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={17} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={closeViewer}
        transparent
        visible={selectedIndex !== null}
      >
        <SafeAreaView edges={viewerEdges} style={styles.viewer}>
          <View
            style={[
              styles.viewerTop,
              iosViewerTopInset > 0 && {
                minHeight: styles.viewerTop.minHeight + iosViewerTopInset,
                paddingTop: iosViewerTopInset,
              },
            ]}
          >
            <Text style={styles.viewerCounter}>
              {selectedIndex !== null ? selectedIndex + 1 : 1} / {photos.length}
            </Text>
            <Pressable
              accessibilityLabel="关闭图片预览"
              accessibilityRole="button"
              hitSlop={Platform.OS === 'ios' ? 12 : undefined}
              onPress={closeViewer}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
          <ScrollView
            key={`viewer-${selectedIndex ?? 0}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: (selectedIndex ?? 0) * width, y: 0 }}
            onMomentumScrollEnd={(event) => {
              if (isClosingViewerRef.current || selectedIndex === null) {
                return;
              }
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
              setSelectedIndex(Math.min(photos.length - 1, Math.max(0, nextIndex)));
            }}
          >
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-viewer-${index}`} style={[styles.viewerPage, { width }]}>
                <Image
                  source={{ uri: photo.uri }}
                  resizeMode="contain"
                  style={[
                    styles.viewerImage,
                    { height: Math.max(260, height - 150 - iosViewerTopInset) },
                  ]}
                />
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  previewRail: {
    gap: 10,
  },
  previewFrame: {
    width: 156,
    height: 156,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    boxShadow: theme.shadows.small,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOpenButton: {
    width: '100%',
    height: '100%',
  },
  previewBadge: {
    position: 'absolute',
    left: 9,
    top: 9,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 24, 40, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  removeButton: {
    position: 'absolute',
    right: 9,
    top: 9,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(16, 24, 40, 0.76)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(4, 9, 18, 0.96)',
  },
  viewerTop: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  viewerCounter: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
  },
  pressed: {
    opacity: 0.72,
  },
});
