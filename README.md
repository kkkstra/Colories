# 燃卡

燃卡是一款本地优先的 Expo / React Native 食物营养记录应用，面向 iOS 和 Android。它用拍照、相册和本地食物库辅助记录一餐，并围绕热量、蛋白质、碳水和脂肪提供目标进度与趋势洞察。

## 当前能力

- 拍照或从相册选择一张或多张食物图片，支持不同图片比例。
- AI 识别食物、份量、烹饪方式、热量和三大营养素。
- 支持包装正面、营养成分表、配料表、菜单或标签文字的识别提示，优先使用图片中的文字营养信息。
- AI 识别时以浮层锁定编辑区并显示耗时，通常提示 10-30 秒完成；识别提示会自动写入备注，便于随记录保存。
- 图片本地保存，缩略图填满卡片，点击后可进入大图页完整查看。
- 记录页支持自定义吃饭日期时间、餐次、标题、备注和食物明细。
- 历史页折叠时显示选中日期所在周，展开后显示完整月历，可切换周/月并选择任意日期查看、编辑、删除记录。
- 食物库包含预置食物、自定义食物、分类筛选和搜索；预置食物详情只读，可复制为我的食物。
- 设置页支持身体信息、目标、AI 服务配置和食物库入口。
- 洞察页显示最近 7 天热量趋势，并在数据变化时缓存/刷新 AI 建议；空白日期不会被当作 0 摄入参与 AI 判断。
- 今日营养小组件显示热量与三大营养素进度。

## 技术栈

- Expo SDK 56
- React Native 0.85
- Expo Router
- Expo SQLite
- Expo SecureStore
- Expo Image Picker / Camera / Image Manipulator
- Expo Blur
- Expo Linear Gradient
- Expo Widgets
- Vitest + TypeScript

仓库要求修改代码前参考版本化文档：[Expo SDK 56 文档](https://docs.expo.dev/versions/v56.0.0/)。

## 本地运行

建议使用 Node 22，仓库包含 `.nvmrc`：

```bash
nvm use
npm install
npm run start
```

常用入口：

```bash
npm run ios
npm run android
npm run web
```

## AI 配置

在应用的“设置”页填写：

- Base URL，例如阿里云百炼兼容 OpenAI 接口：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- 支持图片输入的模型 ID
- 用户自己的 API Key

“测试并保存”会发送一张微型测试图片，并自动选择接口支持的最佳 JSON 返回模式：

- `json_schema`
- `json_object`
- 提示词约束 JSON

API Key 使用 `expo-secure-store` 保存。普通配置、目标、食物库和饮食记录使用 SQLite 保存在本机。

## 数据与隐私

- 身体信息、目标、饮食记录、食物库和本地图片默认只保存在设备上。
- 只有用户主动选择用于识别的压缩图片会发送到其配置的模型服务。
- 多图识别会把图片作为同一餐的不同角度或不同菜品综合判断，并提示模型不要重复统计同一道食物。
- AI 建议只基于有记录的日期生成；没有记录的日期只作为记录完整度提醒。
- 识别结果和营养数据均为估算，不用于医疗诊断、治疗或处方。

## 验证

```bash
npm run typecheck
npm test
npx expo-doctor
```

## 构建

EAS 构建：

```bash
npx eas build --profile preview --platform android
npx eas build --profile production --platform ios
```

Android `preview` 产出 APK。iOS TestFlight 构建需要有效的 Apple Developer 账号和签名配置。

本机 Android APK 构建脚本：

```bash
./build-android-apk.sh debug
./build-android-apk.sh release
```

脚本默认使用 Homebrew 安装的 Android command-line tools 和 JDK 17；如果本机路径不同，需要同步调整脚本中的路径。
