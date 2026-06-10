# 燃卡

燃卡是一款本地优先的 Expo / React Native 食物营养记录 MVP，支持 iOS 和 Android。

## 已实现

- 拍照或从相册选择食物图片，压缩后发送到用户配置的 OpenAI 兼容视觉接口
- 自动探测 `json_schema`、`json_object`、提示词 JSON 三种返回模式
- API Key 使用 `expo-secure-store` 保存，普通配置与饮食记录使用 SQLite
- 216 个中文本地化食物条目，包含 USDA FoodData Central CC0 来源说明
- AI 结果确认与修改、本地食物搜索、自定义食物、历史查看与编辑
- Mifflin-St Jeor 热量目标以及蛋白质、碳水、脂肪目标

## 本地运行

建议使用 Node 22：

```bash
nvm use
npm install
npm run start
```

然后使用 Expo Go 扫码，或执行：

```bash
npm run ios
npm run android
```

## AI 配置

在“设置”中填写：

- Base URL，例如阿里云百炼北京地域 `https://dashscope.aliyuncs.com/compatible-mode/v1`
- 支持图片输入的模型 ID
- 用户自己的 API Key

“测试并保存”会实际发送一张微型测试图片，并选择该接口支持的最佳 JSON 返回模式。

## 验证

```bash
npm run typecheck
npm test
npx expo-doctor
```

## 内测构建

安装并登录 EAS CLI 后：

```bash
npx eas build --profile preview --platform android
npx eas build --profile production --platform ios
```

Android `preview` 产出 APK。iOS TestFlight 构建需要有效的 Apple Developer 账号和对应签名配置。

## 隐私说明

- 身体信息、目标、饮食记录和缩略图默认只保存在设备上。
- 只有用户主动选择的压缩照片会发送到其配置的模型服务。
- 识别与营养结果仅为估算，不用于医疗诊断、治疗或处方。
