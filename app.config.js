const baseConfig = require('./app.json');

function pluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

module.exports = () => {
  const config = JSON.parse(JSON.stringify(baseConfig.expo));
  const iosWidgetsEnabled = process.env.EXPO_ENABLE_IOS_WIDGETS === '1';

  config.extra = {
    ...(config.extra ?? {}),
    iosWidgetsEnabled,
  };

  if (!iosWidgetsEnabled) {
    config.plugins = config.plugins.filter((plugin) => pluginName(plugin) !== 'expo-widgets');
  }

  return config;
};
