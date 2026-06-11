import type { FoodCatalogItem, FoodCategory, MacroValues } from '@/types/domain';
import { round } from '@/lib/nutrition';

type FoodSeed = MacroValues & {
  id: string;
  nameZh: string;
  nameEn: string;
  category: FoodCategory;
  aliases: string[];
  sourceReference?: string;
};

const USDA_FDC_SOURCE = 'USDA FoodData Central https://fdc.nal.usda.gov (Foundation/SR Legacy/FNDDS, CC0)';
const HK_NIIS_SOURCE = '香港食安中心 NIIS https://www.cfs.gov.hk/english/nutrient/';

const CATEGORY_SOURCE_REFERENCES: Record<FoodCategory, string> = {
  staple: `${USDA_FDC_SOURCE}；${HK_NIIS_SOURCE} 常见主食数据；每 100g 可食部`,
  protein: `${USDA_FDC_SOURCE}；${HK_NIIS_SOURCE} 肉蛋鱼豆数据；每 100g 可食部`,
  vegetable: `${USDA_FDC_SOURCE}；${HK_NIIS_SOURCE} 蔬菜数据；每 100g 可食部`,
  fruit: `${USDA_FDC_SOURCE}；${HK_NIIS_SOURCE} 水果数据；每 100g 可食部`,
  dairy: `${USDA_FDC_SOURCE}；${HK_NIIS_SOURCE} 奶类数据；每 100g/ml`,
  snack: `${USDA_FDC_SOURCE} (Branded Foods/FNDDS)；公开营养标签均值；每 100g 可食部`,
  dish: `${HK_NIIS_SOURCE} 常见餐食数据；中国疾控营养与食品安全所食物成分数据；USDA FNDDS 相近餐食；每 100g 估算`,
  beverage: `${USDA_FDC_SOURCE} (Branded Foods/FNDDS)；${HK_NIIS_SOURCE} 饮品数据；每 100ml`,
  condiment: `${USDA_FDC_SOURCE}；${HK_NIIS_SOURCE} 调味品数据；每 100g/ml`,
};

// Values are approximate nutrition per 100 g. The app always exposes the source
// and lets the user correct any value before saving.
const SEEDS: FoodSeed[] = [
  { id: 'rice-white', nameZh: '白米饭', nameEn: 'Cooked white rice', category: 'staple', calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3, aliases: ['米饭', '大米饭'] },
  { id: 'rice-brown', nameZh: '糙米饭', nameEn: 'Cooked brown rice', category: 'staple', calories: 123, protein: 2.7, carbs: 25.6, fat: 1, aliases: ['糙米'] },
  { id: 'rice-mixed', nameZh: '杂粮饭', nameEn: 'Cooked mixed grain rice', category: 'staple', calories: 125, protein: 3.4, carbs: 25, fat: 1.1, aliases: ['五谷饭'] },
  { id: 'congee', nameZh: '白粥', nameEn: 'Rice porridge', category: 'staple', calories: 46, protein: 1, carbs: 10, fat: 0.1, aliases: ['稀饭', '米粥'] },
  { id: 'oatmeal', nameZh: '燕麦粥', nameEn: 'Cooked oatmeal', category: 'staple', calories: 71, protein: 2.5, carbs: 12, fat: 1.5, aliases: ['燕麦'] },
  { id: 'noodle-wheat', nameZh: '小麦面条', nameEn: 'Cooked wheat noodles', category: 'staple', calories: 138, protein: 4.5, carbs: 25, fat: 2.1, aliases: ['面条', '挂面'] },
  { id: 'noodle-rice', nameZh: '米粉', nameEn: 'Cooked rice noodles', category: 'staple', calories: 109, protein: 0.9, carbs: 24.9, fat: 0.2, aliases: ['米线', '河粉'] },
  { id: 'noodle-buckwheat', nameZh: '荞麦面', nameEn: 'Cooked buckwheat noodles', category: 'staple', calories: 99, protein: 5.1, carbs: 21.4, fat: 0.1, aliases: ['荞麦面条'] },
  { id: 'bread-white', nameZh: '白面包', nameEn: 'White bread', category: 'staple', calories: 266, protein: 8.9, carbs: 49.4, fat: 3.3, aliases: ['吐司', '白吐司'] },
  { id: 'bread-whole', nameZh: '全麦面包', nameEn: 'Whole wheat bread', category: 'staple', calories: 247, protein: 13, carbs: 41, fat: 3.4, aliases: ['全麦吐司'] },
  { id: 'mantou', nameZh: '馒头', nameEn: 'Steamed wheat bun', category: 'staple', calories: 223, protein: 7, carbs: 47, fat: 1.1, aliases: ['白馒头'] },
  { id: 'corn', nameZh: '玉米', nameEn: 'Cooked sweet corn', category: 'staple', calories: 96, protein: 3.4, carbs: 21, fat: 1.5, aliases: ['甜玉米', '玉米棒'] },
  { id: 'sweet-potato', nameZh: '红薯', nameEn: 'Cooked sweet potato', category: 'staple', calories: 90, protein: 2, carbs: 20.7, fat: 0.2, aliases: ['地瓜', '番薯'] },
  { id: 'potato', nameZh: '土豆', nameEn: 'Boiled potato', category: 'staple', calories: 87, protein: 1.9, carbs: 20.1, fat: 0.1, aliases: ['马铃薯'] },
  { id: 'pumpkin', nameZh: '南瓜', nameEn: 'Cooked pumpkin', category: 'staple', calories: 34, protein: 1.1, carbs: 8.1, fat: 0.1, aliases: ['倭瓜'] },
  { id: 'chicken-breast', nameZh: '鸡胸肉', nameEn: 'Cooked chicken breast', category: 'protein', calories: 165, protein: 31, carbs: 0, fat: 3.6, aliases: ['鸡胸', '鸡脯肉'] },
  { id: 'chicken-thigh', nameZh: '鸡腿肉', nameEn: 'Cooked chicken thigh', category: 'protein', calories: 209, protein: 26, carbs: 0, fat: 10.9, aliases: ['鸡腿'] },
  { id: 'turkey', nameZh: '火鸡胸肉', nameEn: 'Cooked turkey breast', category: 'protein', calories: 147, protein: 30, carbs: 0, fat: 2.1, aliases: ['火鸡肉'] },
  { id: 'beef-lean', nameZh: '瘦牛肉', nameEn: 'Cooked lean beef', category: 'protein', calories: 217, protein: 26.1, carbs: 0, fat: 11.8, aliases: ['牛肉'] },
  { id: 'beef-tenderloin', nameZh: '牛里脊', nameEn: 'Cooked beef tenderloin', category: 'protein', calories: 211, protein: 28, carbs: 0, fat: 10, aliases: ['牛柳'] },
  { id: 'pork-lean', nameZh: '瘦猪肉', nameEn: 'Cooked lean pork', category: 'protein', calories: 242, protein: 27, carbs: 0, fat: 14, aliases: ['猪瘦肉'] },
  { id: 'pork-tenderloin', nameZh: '猪里脊', nameEn: 'Cooked pork tenderloin', category: 'protein', calories: 196, protein: 29, carbs: 0, fat: 7.5, aliases: ['里脊肉'] },
  { id: 'lamb-lean', nameZh: '瘦羊肉', nameEn: 'Cooked lean lamb', category: 'protein', calories: 206, protein: 28.2, carbs: 0, fat: 9.5, aliases: ['羊肉'] },
  { id: 'salmon', nameZh: '三文鱼', nameEn: 'Cooked salmon', category: 'protein', calories: 206, protein: 22.1, carbs: 0, fat: 12.4, aliases: ['鲑鱼'] },
  { id: 'cod', nameZh: '鳕鱼', nameEn: 'Cooked cod', category: 'protein', calories: 89, protein: 19.9, carbs: 0, fat: 0.7, aliases: ['大西洋鳕鱼'] },
  { id: 'tilapia', nameZh: '罗非鱼', nameEn: 'Cooked tilapia', category: 'protein', calories: 128, protein: 26.2, carbs: 0, fat: 2.7, aliases: ['非洲鲫鱼'] },
  { id: 'tuna', nameZh: '金枪鱼', nameEn: 'Cooked tuna', category: 'protein', calories: 132, protein: 28, carbs: 0, fat: 1.3, aliases: ['吞拿鱼'] },
  { id: 'shrimp', nameZh: '虾仁', nameEn: 'Cooked shrimp', category: 'protein', calories: 99, protein: 24, carbs: 0.2, fat: 0.3, aliases: ['虾', '大虾'] },
  { id: 'egg', nameZh: '鸡蛋', nameEn: 'Whole egg', category: 'protein', calories: 155, protein: 12.6, carbs: 1.1, fat: 10.6, aliases: ['全蛋'] },
  { id: 'egg-white', nameZh: '蛋白', nameEn: 'Egg white', category: 'protein', calories: 52, protein: 10.9, carbs: 0.7, fat: 0.2, aliases: ['鸡蛋白'] },
  { id: 'tofu-firm', nameZh: '北豆腐', nameEn: 'Firm tofu', category: 'protein', calories: 144, protein: 17.3, carbs: 2.8, fat: 8.7, aliases: ['老豆腐', '硬豆腐'] },
  { id: 'tofu-soft', nameZh: '嫩豆腐', nameEn: 'Soft tofu', category: 'protein', calories: 61, protein: 7.2, carbs: 1.2, fat: 3.7, aliases: ['南豆腐'] },
  { id: 'tempeh', nameZh: '天贝', nameEn: 'Cooked tempeh', category: 'protein', calories: 195, protein: 19.9, carbs: 7.6, fat: 11.4, aliases: ['发酵豆饼'] },
  { id: 'edamame', nameZh: '毛豆', nameEn: 'Cooked edamame', category: 'protein', calories: 121, protein: 11.9, carbs: 8.9, fat: 5.2, aliases: ['青豆'] },
  { id: 'broccoli', nameZh: '西兰花', nameEn: 'Cooked broccoli', category: 'vegetable', calories: 35, protein: 2.4, carbs: 7.2, fat: 0.4, aliases: ['绿花椰菜'] },
  { id: 'cauliflower', nameZh: '菜花', nameEn: 'Cooked cauliflower', category: 'vegetable', calories: 23, protein: 1.8, carbs: 4.1, fat: 0.5, aliases: ['花椰菜'] },
  { id: 'spinach', nameZh: '菠菜', nameEn: 'Cooked spinach', category: 'vegetable', calories: 23, protein: 3, carbs: 3.8, fat: 0.3, aliases: [] },
  { id: 'bok-choy', nameZh: '小白菜', nameEn: 'Cooked bok choy', category: 'vegetable', calories: 12, protein: 1.6, carbs: 1.8, fat: 0.2, aliases: ['青菜'] },
  { id: 'lettuce', nameZh: '生菜', nameEn: 'Lettuce', category: 'vegetable', calories: 15, protein: 1.4, carbs: 2.9, fat: 0.2, aliases: ['莴苣叶'] },
  { id: 'cabbage', nameZh: '卷心菜', nameEn: 'Cooked cabbage', category: 'vegetable', calories: 23, protein: 1.3, carbs: 5.5, fat: 0.1, aliases: ['包菜', '圆白菜'] },
  { id: 'chinese-cabbage', nameZh: '大白菜', nameEn: 'Napa cabbage', category: 'vegetable', calories: 16, protein: 1.2, carbs: 3.2, fat: 0.2, aliases: ['白菜'] },
  { id: 'tomato', nameZh: '番茄', nameEn: 'Tomato', category: 'vegetable', calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, aliases: ['西红柿'] },
  { id: 'cucumber', nameZh: '黄瓜', nameEn: 'Cucumber', category: 'vegetable', calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1, aliases: ['青瓜'] },
  { id: 'carrot', nameZh: '胡萝卜', nameEn: 'Cooked carrot', category: 'vegetable', calories: 35, protein: 0.8, carbs: 8.2, fat: 0.2, aliases: ['红萝卜'] },
  { id: 'mushroom', nameZh: '香菇', nameEn: 'Cooked shiitake', category: 'vegetable', calories: 56, protein: 1.6, carbs: 14.4, fat: 0.2, aliases: ['冬菇'] },
  { id: 'oyster-mushroom', nameZh: '平菇', nameEn: 'Oyster mushroom', category: 'vegetable', calories: 33, protein: 3.3, carbs: 6.1, fat: 0.4, aliases: ['侧耳'] },
  { id: 'eggplant', nameZh: '茄子', nameEn: 'Cooked eggplant', category: 'vegetable', calories: 35, protein: 0.8, carbs: 8.7, fat: 0.2, aliases: [] },
  { id: 'pepper', nameZh: '青椒', nameEn: 'Green pepper', category: 'vegetable', calories: 20, protein: 0.9, carbs: 4.6, fat: 0.2, aliases: ['甜椒'] },
  { id: 'asparagus', nameZh: '芦笋', nameEn: 'Cooked asparagus', category: 'vegetable', calories: 22, protein: 2.4, carbs: 4.1, fat: 0.2, aliases: [] },
  { id: 'zucchini', nameZh: '西葫芦', nameEn: 'Cooked zucchini', category: 'vegetable', calories: 17, protein: 1.2, carbs: 3.1, fat: 0.3, aliases: ['角瓜'] },
  { id: 'apple', nameZh: '苹果', nameEn: 'Apple', category: 'fruit', calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2, aliases: [] },
  { id: 'banana', nameZh: '香蕉', nameEn: 'Banana', category: 'fruit', calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, aliases: [] },
  { id: 'orange', nameZh: '橙子', nameEn: 'Orange', category: 'fruit', calories: 47, protein: 0.9, carbs: 11.8, fat: 0.1, aliases: ['甜橙'] },
  { id: 'pear', nameZh: '梨', nameEn: 'Pear', category: 'fruit', calories: 57, protein: 0.4, carbs: 15.2, fat: 0.1, aliases: ['雪梨'] },
  { id: 'grape', nameZh: '葡萄', nameEn: 'Grapes', category: 'fruit', calories: 69, protein: 0.7, carbs: 18.1, fat: 0.2, aliases: [] },
  { id: 'blueberry', nameZh: '蓝莓', nameEn: 'Blueberries', category: 'fruit', calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3, aliases: [] },
  { id: 'strawberry', nameZh: '草莓', nameEn: 'Strawberries', category: 'fruit', calories: 32, protein: 0.7, carbs: 7.7, fat: 0.3, aliases: [] },
  { id: 'kiwi', nameZh: '猕猴桃', nameEn: 'Kiwi fruit', category: 'fruit', calories: 61, protein: 1.1, carbs: 14.7, fat: 0.5, aliases: ['奇异果'] },
  { id: 'mango', nameZh: '芒果', nameEn: 'Mango', category: 'fruit', calories: 60, protein: 0.8, carbs: 15, fat: 0.4, aliases: [] },
  { id: 'watermelon', nameZh: '西瓜', nameEn: 'Watermelon', category: 'fruit', calories: 30, protein: 0.6, carbs: 7.6, fat: 0.2, aliases: [] },
  { id: 'milk-whole', nameZh: '全脂牛奶', nameEn: 'Whole milk', category: 'dairy', calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3, aliases: ['纯牛奶'] },
  { id: 'milk-lowfat', nameZh: '低脂牛奶', nameEn: 'Low-fat milk', category: 'dairy', calories: 42, protein: 3.4, carbs: 5, fat: 1, aliases: [] },
  { id: 'soy-milk', nameZh: '无糖豆浆', nameEn: 'Unsweetened soy milk', category: 'dairy', calories: 33, protein: 2.9, carbs: 1.7, fat: 1.6, aliases: ['豆浆'] },
  { id: 'yogurt', nameZh: '原味酸奶', nameEn: 'Plain yogurt', category: 'dairy', calories: 63, protein: 5.3, carbs: 7, fat: 1.6, aliases: ['酸奶'] },
  { id: 'greek-yogurt', nameZh: '希腊酸奶', nameEn: 'Greek yogurt', category: 'dairy', calories: 73, protein: 10, carbs: 3.9, fat: 2, aliases: ['高蛋白酸奶'] },
  { id: 'cottage-cheese', nameZh: '茅屋奶酪', nameEn: 'Cottage cheese', category: 'dairy', calories: 98, protein: 11.1, carbs: 3.4, fat: 4.3, aliases: ['乡村奶酪'] },
  { id: 'almond', nameZh: '杏仁', nameEn: 'Almonds', category: 'snack', calories: 579, protein: 21.2, carbs: 21.6, fat: 49.9, aliases: [] },
  { id: 'walnut', nameZh: '核桃', nameEn: 'Walnuts', category: 'snack', calories: 654, protein: 15.2, carbs: 13.7, fat: 65.2, aliases: [] },
  { id: 'peanut', nameZh: '花生', nameEn: 'Peanuts', category: 'snack', calories: 567, protein: 25.8, carbs: 16.1, fat: 49.2, aliases: [] },
  { id: 'protein-powder', nameZh: '乳清蛋白粉', nameEn: 'Whey protein powder', category: 'snack', calories: 400, protein: 78, carbs: 8, fat: 6, aliases: ['蛋白粉', '乳清'] },
  { id: 'dark-chocolate', nameZh: '黑巧克力', nameEn: 'Dark chocolate', category: 'snack', calories: 598, protein: 7.8, carbs: 45.9, fat: 42.6, aliases: ['黑巧'] },
  { id: 'chicken-rice', nameZh: '鸡胸肉饭', nameEn: 'Chicken breast rice bowl', category: 'dish', calories: 165, protein: 12.5, carbs: 20, fat: 3.8, aliases: ['鸡肉饭', '健身餐'] },
  { id: 'beef-rice', nameZh: '牛肉饭', nameEn: 'Beef rice bowl', category: 'dish', calories: 190, protein: 10.5, carbs: 22, fat: 6.8, aliases: ['肥牛饭'] },
  { id: 'tomato-egg', nameZh: '番茄炒蛋', nameEn: 'Tomato scrambled eggs', category: 'dish', calories: 112, protein: 6.2, carbs: 4.6, fat: 7.8, aliases: ['西红柿炒鸡蛋'] },
  { id: 'mapo-tofu', nameZh: '麻婆豆腐', nameEn: 'Mapo tofu', category: 'dish', calories: 133, protein: 8, carbs: 5.8, fat: 9, aliases: [] },
  { id: 'dumpling', nameZh: '猪肉水饺', nameEn: 'Pork dumplings', category: 'dish', calories: 218, protein: 9.5, carbs: 29, fat: 7.5, aliases: ['饺子', '水饺'] },
  { id: 'baozi-pork', nameZh: '猪肉包子', nameEn: 'Steamed pork bun', category: 'staple', calories: 227, protein: 8.2, carbs: 32.6, fat: 7.2, aliases: ['肉包', '包子'] },
  { id: 'baozi-vegetable', nameZh: '素菜包子', nameEn: 'Steamed vegetable bun', category: 'staple', calories: 190, protein: 6.1, carbs: 35.2, fat: 3.2, aliases: ['菜包', '素包'] },
  { id: 'youtiao', nameZh: '油条', nameEn: 'Chinese fried dough stick', category: 'staple', calories: 388, protein: 6.9, carbs: 51.1, fat: 17.6, aliases: ['炸油条'] },
  { id: 'jianbing', nameZh: '煎饼果子', nameEn: 'Jianbing', category: 'staple', calories: 260, protein: 8.5, carbs: 36, fat: 9.4, aliases: ['煎饼'] },
  { id: 'scallion-pancake', nameZh: '葱油饼', nameEn: 'Scallion pancake', category: 'staple', calories: 301, protein: 7.1, carbs: 41.5, fat: 11.2, aliases: ['葱花饼'] },
  { id: 'shaobing', nameZh: '烧饼', nameEn: 'Sesame flatbread', category: 'staple', calories: 298, protein: 8.8, carbs: 48.6, fat: 8.4, aliases: ['芝麻烧饼'] },
  { id: 'rice-roll', nameZh: '肠粉', nameEn: 'Steamed rice noodle roll', category: 'staple', calories: 118, protein: 2.7, carbs: 23.4, fat: 1.8, aliases: ['广东肠粉'] },
  { id: 'rice-cake', nameZh: '年糕', nameEn: 'Rice cake', category: 'staple', calories: 234, protein: 4, carbs: 51, fat: 0.8, aliases: ['糯米年糕'] },
  { id: 'zongzi-pork', nameZh: '鲜肉粽', nameEn: 'Pork sticky rice dumpling', category: 'staple', calories: 276, protein: 9.4, carbs: 38.5, fat: 9.2, aliases: ['肉粽', '粽子'] },
  { id: 'zongzi-red-bean', nameZh: '豆沙粽', nameEn: 'Red bean sticky rice dumpling', category: 'staple', calories: 244, protein: 5.1, carbs: 51.6, fat: 2.2, aliases: ['甜粽'] },
  { id: 'quinoa', nameZh: '藜麦', nameEn: 'Cooked quinoa', category: 'staple', calories: 120, protein: 4.4, carbs: 21.3, fat: 1.9, aliases: [] },
  { id: 'millet-congee', nameZh: '小米粥', nameEn: 'Millet porridge', category: 'staple', calories: 46, protein: 1.4, carbs: 9.7, fat: 0.4, aliases: ['小米稀饭'] },
  { id: 'black-rice', nameZh: '黑米饭', nameEn: 'Cooked black rice', category: 'staple', calories: 145, protein: 3.5, carbs: 31.1, fat: 0.9, aliases: ['紫米饭'] },
  { id: 'barley', nameZh: '薏米饭', nameEn: 'Cooked pearl barley', category: 'staple', calories: 123, protein: 2.3, carbs: 28.2, fat: 0.4, aliases: ['薏仁'] },
  { id: 'pasta', nameZh: '意大利面', nameEn: 'Cooked pasta', category: 'staple', calories: 158, protein: 5.8, carbs: 30.9, fat: 0.9, aliases: ['意面'] },
  { id: 'udon', nameZh: '乌冬面', nameEn: 'Cooked udon noodles', category: 'staple', calories: 127, protein: 3.2, carbs: 25.1, fat: 0.4, aliases: ['乌冬'] },
  { id: 'instant-noodle', nameZh: '方便面面饼', nameEn: 'Instant noodle cake', category: 'staple', calories: 472, protein: 9.9, carbs: 61.6, fat: 20.2, aliases: ['泡面面饼', '方便面'] },
  { id: 'taro', nameZh: '芋头', nameEn: 'Cooked taro', category: 'staple', calories: 142, protein: 0.5, carbs: 34.6, fat: 0.1, aliases: ['芋艿'] },
  { id: 'yam', nameZh: '山药', nameEn: 'Chinese yam', category: 'staple', calories: 57, protein: 1.9, carbs: 12.4, fat: 0.2, aliases: ['淮山'] },
  { id: 'chestnut', nameZh: '板栗', nameEn: 'Roasted chestnut', category: 'staple', calories: 245, protein: 3.2, carbs: 53, fat: 2.2, aliases: ['栗子'] },
  { id: 'chicken-wing', nameZh: '鸡翅', nameEn: 'Cooked chicken wing', category: 'protein', calories: 203, protein: 30.5, carbs: 0, fat: 8.1, aliases: ['鸡中翅'] },
  { id: 'duck-breast', nameZh: '鸭胸肉', nameEn: 'Cooked duck breast', category: 'protein', calories: 201, protein: 23.5, carbs: 0, fat: 11.2, aliases: ['鸭肉'] },
  { id: 'duck-leg', nameZh: '鸭腿', nameEn: 'Cooked duck leg', category: 'protein', calories: 217, protein: 24, carbs: 0, fat: 13, aliases: [] },
  { id: 'pork-belly', nameZh: '五花肉', nameEn: 'Cooked pork belly', category: 'protein', calories: 518, protein: 9.3, carbs: 0, fat: 53, aliases: ['三层肉'] },
  { id: 'pork-rib', nameZh: '猪排骨', nameEn: 'Cooked pork ribs', category: 'protein', calories: 291, protein: 23, carbs: 0, fat: 21.7, aliases: ['排骨'] },
  { id: 'pork-liver', nameZh: '猪肝', nameEn: 'Cooked pork liver', category: 'protein', calories: 165, protein: 26, carbs: 3.8, fat: 4.4, aliases: [] },
  { id: 'beef-brisket', nameZh: '牛腩', nameEn: 'Cooked beef brisket', category: 'protein', calories: 250, protein: 25, carbs: 0, fat: 16.5, aliases: ['牛肋条'] },
  { id: 'beef-shank', nameZh: '牛腱子', nameEn: 'Cooked beef shank', category: 'protein', calories: 187, protein: 31, carbs: 0, fat: 6.1, aliases: ['牛腱'] },
  { id: 'lamb-chop', nameZh: '羊排', nameEn: 'Cooked lamb chop', category: 'protein', calories: 294, protein: 24, carbs: 0, fat: 21, aliases: [] },
  { id: 'mackerel', nameZh: '鲭鱼', nameEn: 'Cooked mackerel', category: 'protein', calories: 205, protein: 18.6, carbs: 0, fat: 13.9, aliases: ['青花鱼'] },
  { id: 'sardine', nameZh: '沙丁鱼', nameEn: 'Cooked sardines', category: 'protein', calories: 208, protein: 24.6, carbs: 0, fat: 11.5, aliases: [] },
  { id: 'yellow-croaker', nameZh: '黄花鱼', nameEn: 'Cooked yellow croaker', category: 'protein', calories: 97, protein: 17.9, carbs: 0, fat: 2.6, aliases: ['黄鱼'] },
  { id: 'crab', nameZh: '蟹肉', nameEn: 'Cooked crab meat', category: 'protein', calories: 97, protein: 19.4, carbs: 0, fat: 1.5, aliases: ['螃蟹'] },
  { id: 'scallop', nameZh: '扇贝', nameEn: 'Cooked scallop', category: 'protein', calories: 111, protein: 20.5, carbs: 5.4, fat: 0.8, aliases: ['干贝肉'] },
  { id: 'squid', nameZh: '鱿鱼', nameEn: 'Cooked squid', category: 'protein', calories: 92, protein: 15.6, carbs: 3.1, fat: 1.4, aliases: [] },
  { id: 'oyster', nameZh: '生蚝', nameEn: 'Cooked oyster', category: 'protein', calories: 68, protein: 7.1, carbs: 3.9, fat: 2.5, aliases: ['牡蛎'] },
  { id: 'tofu-skin', nameZh: '豆腐皮', nameEn: 'Tofu skin', category: 'protein', calories: 409, protein: 44.6, carbs: 18.6, fat: 17.4, aliases: ['千张', '百叶'] },
  { id: 'dried-tofu', nameZh: '豆干', nameEn: 'Pressed tofu', category: 'protein', calories: 197, protein: 19.3, carbs: 5.1, fat: 11.5, aliases: ['香干'] },
  { id: 'seitan', nameZh: '面筋', nameEn: 'Wheat gluten', category: 'protein', calories: 141, protein: 24.5, carbs: 8, fat: 1.1, aliases: ['烤麸'] },
  { id: 'chickpea', nameZh: '鹰嘴豆', nameEn: 'Cooked chickpeas', category: 'protein', calories: 164, protein: 8.9, carbs: 27.4, fat: 2.6, aliases: [] },
  { id: 'black-bean', nameZh: '黑豆', nameEn: 'Cooked black beans', category: 'protein', calories: 132, protein: 8.9, carbs: 23.7, fat: 0.5, aliases: [] },
  { id: 'green-bean', nameZh: '四季豆', nameEn: 'Cooked green beans', category: 'vegetable', calories: 35, protein: 1.9, carbs: 7.9, fat: 0.3, aliases: ['豆角'] },
  { id: 'snow-pea', nameZh: '荷兰豆', nameEn: 'Snow peas', category: 'vegetable', calories: 42, protein: 2.8, carbs: 7.6, fat: 0.2, aliases: [] },
  { id: 'celery', nameZh: '芹菜', nameEn: 'Celery', category: 'vegetable', calories: 16, protein: 0.7, carbs: 3, fat: 0.2, aliases: [] },
  { id: 'onion', nameZh: '洋葱', nameEn: 'Onion', category: 'vegetable', calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1, aliases: [] },
  { id: 'garlic-chive', nameZh: '韭菜', nameEn: 'Garlic chives', category: 'vegetable', calories: 30, protein: 2.4, carbs: 4.6, fat: 0.7, aliases: [] },
  { id: 'leek', nameZh: '大葱', nameEn: 'Leek', category: 'vegetable', calories: 61, protein: 1.5, carbs: 14.2, fat: 0.3, aliases: ['葱'] },
  { id: 'kale', nameZh: '羽衣甘蓝', nameEn: 'Kale', category: 'vegetable', calories: 35, protein: 2.9, carbs: 4.4, fat: 1.5, aliases: [] },
  { id: 'choy-sum', nameZh: '菜心', nameEn: 'Choy sum', category: 'vegetable', calories: 19, protein: 1.6, carbs: 3.3, fat: 0.3, aliases: [] },
  { id: 'water-spinach', nameZh: '空心菜', nameEn: 'Water spinach', category: 'vegetable', calories: 19, protein: 2.6, carbs: 3.1, fat: 0.2, aliases: ['通菜'] },
  { id: 'bean-sprout', nameZh: '绿豆芽', nameEn: 'Mung bean sprouts', category: 'vegetable', calories: 30, protein: 3, carbs: 5.9, fat: 0.2, aliases: ['豆芽'] },
  { id: 'lotus-root', nameZh: '莲藕', nameEn: 'Lotus root', category: 'vegetable', calories: 74, protein: 2.6, carbs: 17.2, fat: 0.1, aliases: ['藕'] },
  { id: 'bamboo-shoot', nameZh: '竹笋', nameEn: 'Bamboo shoots', category: 'vegetable', calories: 27, protein: 2.6, carbs: 5.2, fat: 0.3, aliases: ['笋'] },
  { id: 'kelp', nameZh: '海带', nameEn: 'Kelp', category: 'vegetable', calories: 43, protein: 1.7, carbs: 9.6, fat: 0.6, aliases: [] },
  { id: 'seaweed', nameZh: '紫菜', nameEn: 'Dried seaweed', category: 'vegetable', calories: 250, protein: 26.7, carbs: 44.1, fat: 1.2, aliases: ['海苔'] },
  { id: 'bitter-melon', nameZh: '苦瓜', nameEn: 'Bitter melon', category: 'vegetable', calories: 17, protein: 1, carbs: 3.7, fat: 0.2, aliases: [] },
  { id: 'winter-melon', nameZh: '冬瓜', nameEn: 'Winter melon', category: 'vegetable', calories: 13, protein: 0.4, carbs: 3, fat: 0.2, aliases: [] },
  { id: 'okra', nameZh: '秋葵', nameEn: 'Okra', category: 'vegetable', calories: 33, protein: 1.9, carbs: 7.5, fat: 0.2, aliases: [] },
  { id: 'white-radish', nameZh: '白萝卜', nameEn: 'Daikon radish', category: 'vegetable', calories: 18, protein: 0.6, carbs: 4.1, fat: 0.1, aliases: ['萝卜'] },
  { id: 'beetroot', nameZh: '甜菜根', nameEn: 'Beetroot', category: 'vegetable', calories: 43, protein: 1.6, carbs: 9.6, fat: 0.2, aliases: ['红菜头'] },
  { id: 'pea', nameZh: '豌豆', nameEn: 'Green peas', category: 'vegetable', calories: 84, protein: 5.4, carbs: 15.6, fat: 0.2, aliases: [] },
  { id: 'peach', nameZh: '桃子', nameEn: 'Peach', category: 'fruit', calories: 39, protein: 0.9, carbs: 9.5, fat: 0.3, aliases: ['水蜜桃'] },
  { id: 'plum', nameZh: '李子', nameEn: 'Plum', category: 'fruit', calories: 46, protein: 0.7, carbs: 11.4, fat: 0.3, aliases: [] },
  { id: 'apricot', nameZh: '杏', nameEn: 'Apricot', category: 'fruit', calories: 48, protein: 1.4, carbs: 11.1, fat: 0.4, aliases: [] },
  { id: 'cherry', nameZh: '樱桃', nameEn: 'Cherries', category: 'fruit', calories: 63, protein: 1.1, carbs: 16, fat: 0.2, aliases: ['车厘子'] },
  { id: 'pineapple', nameZh: '菠萝', nameEn: 'Pineapple', category: 'fruit', calories: 50, protein: 0.5, carbs: 13.1, fat: 0.1, aliases: ['凤梨'] },
  { id: 'papaya', nameZh: '木瓜', nameEn: 'Papaya', category: 'fruit', calories: 43, protein: 0.5, carbs: 10.8, fat: 0.3, aliases: [] },
  { id: 'grapefruit', nameZh: '西柚', nameEn: 'Grapefruit', category: 'fruit', calories: 42, protein: 0.8, carbs: 10.7, fat: 0.1, aliases: ['葡萄柚'] },
  { id: 'pomegranate', nameZh: '石榴', nameEn: 'Pomegranate', category: 'fruit', calories: 83, protein: 1.7, carbs: 18.7, fat: 1.2, aliases: [] },
  { id: 'dragon-fruit', nameZh: '火龙果', nameEn: 'Dragon fruit', category: 'fruit', calories: 57, protein: 0.4, carbs: 13.2, fat: 0.1, aliases: [] },
  { id: 'lychee', nameZh: '荔枝', nameEn: 'Lychee', category: 'fruit', calories: 66, protein: 0.8, carbs: 16.5, fat: 0.4, aliases: [] },
  { id: 'longan', nameZh: '龙眼', nameEn: 'Longan', category: 'fruit', calories: 60, protein: 1.3, carbs: 15.1, fat: 0.1, aliases: ['桂圆'] },
  { id: 'durian', nameZh: '榴莲', nameEn: 'Durian', category: 'fruit', calories: 147, protein: 1.5, carbs: 27.1, fat: 5.3, aliases: [] },
  { id: 'cantaloupe', nameZh: '哈密瓜', nameEn: 'Cantaloupe', category: 'fruit', calories: 34, protein: 0.8, carbs: 8.2, fat: 0.2, aliases: [] },
  { id: 'avocado', nameZh: '牛油果', nameEn: 'Avocado', category: 'fruit', calories: 160, protein: 2, carbs: 8.5, fat: 14.7, aliases: ['鳄梨'] },
  { id: 'date', nameZh: '红枣', nameEn: 'Dried jujube', category: 'fruit', calories: 287, protein: 3.7, carbs: 73.6, fat: 1.1, aliases: ['枣'] },
  { id: 'milk-skim', nameZh: '脱脂牛奶', nameEn: 'Skim milk', category: 'dairy', calories: 34, protein: 3.4, carbs: 5, fat: 0.1, aliases: ['脱脂奶'] },
  { id: 'cheddar', nameZh: '切达奶酪', nameEn: 'Cheddar cheese', category: 'dairy', calories: 403, protein: 24.9, carbs: 1.3, fat: 33.1, aliases: ['车达芝士'] },
  { id: 'mozzarella', nameZh: '马苏里拉奶酪', nameEn: 'Mozzarella cheese', category: 'dairy', calories: 280, protein: 28, carbs: 3.1, fat: 17, aliases: ['马苏里拉'] },
  { id: 'cream-cheese', nameZh: '奶油奶酪', nameEn: 'Cream cheese', category: 'dairy', calories: 342, protein: 6.2, carbs: 4.1, fat: 34.2, aliases: ['奶油芝士'] },
  { id: 'butter', nameZh: '黄油', nameEn: 'Butter', category: 'dairy', calories: 717, protein: 0.9, carbs: 0.1, fat: 81.1, aliases: ['牛油'] },
  { id: 'cream', nameZh: '淡奶油', nameEn: 'Heavy cream', category: 'dairy', calories: 340, protein: 2.8, carbs: 2.8, fat: 36.1, aliases: ['稀奶油'] },
  { id: 'kefir', nameZh: '开菲尔酸奶', nameEn: 'Kefir', category: 'dairy', calories: 64, protein: 3.3, carbs: 4.8, fat: 3.5, aliases: ['发酵乳'] },
  { id: 'milk-powder', nameZh: '全脂奶粉', nameEn: 'Whole milk powder', category: 'dairy', calories: 496, protein: 26.3, carbs: 38.4, fat: 26.7, aliases: ['奶粉'] },
  { id: 'cashew', nameZh: '腰果', nameEn: 'Cashews', category: 'snack', calories: 553, protein: 18.2, carbs: 30.2, fat: 43.9, aliases: [] },
  { id: 'pistachio', nameZh: '开心果', nameEn: 'Pistachios', category: 'snack', calories: 560, protein: 20.2, carbs: 27.2, fat: 45.3, aliases: [] },
  { id: 'sunflower-seed', nameZh: '瓜子', nameEn: 'Sunflower seeds', category: 'snack', calories: 584, protein: 20.8, carbs: 20, fat: 51.5, aliases: ['葵花籽'] },
  { id: 'potato-chip', nameZh: '薯片', nameEn: 'Potato chips', category: 'snack', calories: 536, protein: 7, carbs: 52.9, fat: 34.6, aliases: [] },
  { id: 'popcorn', nameZh: '爆米花', nameEn: 'Popcorn', category: 'snack', calories: 387, protein: 12.9, carbs: 77.8, fat: 4.5, aliases: [] },
  { id: 'soda-cracker', nameZh: '苏打饼干', nameEn: 'Soda crackers', category: 'snack', calories: 421, protein: 9.2, carbs: 74.1, fat: 9.5, aliases: ['饼干'] },
  { id: 'butter-cookie', nameZh: '曲奇饼干', nameEn: 'Butter cookies', category: 'snack', calories: 502, protein: 6.1, carbs: 64.8, fat: 24.5, aliases: ['曲奇'] },
  { id: 'sponge-cake', nameZh: '蛋糕', nameEn: 'Sponge cake', category: 'snack', calories: 297, protein: 5.4, carbs: 57.7, fat: 4.3, aliases: ['海绵蛋糕'] },
  { id: 'mooncake', nameZh: '月饼', nameEn: 'Mooncake', category: 'snack', calories: 421, protein: 7.4, carbs: 58.6, fat: 17.8, aliases: [] },
  { id: 'ice-cream', nameZh: '冰淇淋', nameEn: 'Ice cream', category: 'snack', calories: 207, protein: 3.5, carbs: 23.6, fat: 11, aliases: ['雪糕'] },
  { id: 'cola', nameZh: '可乐', nameEn: 'Cola', category: 'beverage', calories: 42, protein: 0, carbs: 10.6, fat: 0, aliases: ['汽水'] },
  { id: 'orange-juice', nameZh: '橙汁', nameEn: 'Orange juice', category: 'beverage', calories: 45, protein: 0.7, carbs: 10.4, fat: 0.2, aliases: ['果汁'] },
  { id: 'apple-juice', nameZh: '苹果汁', nameEn: 'Apple juice', category: 'beverage', calories: 46, protein: 0.1, carbs: 11.3, fat: 0.1, aliases: [] },
  { id: 'soy-milk-sweet', nameZh: '甜豆浆', nameEn: 'Sweetened soy milk', category: 'beverage', calories: 54, protein: 2.6, carbs: 6.7, fat: 1.8, aliases: [] },
  { id: 'bubble-tea', nameZh: '珍珠奶茶', nameEn: 'Bubble milk tea', category: 'beverage', calories: 96, protein: 1.2, carbs: 17.8, fat: 2.4, aliases: ['奶茶'] },
  { id: 'latte', nameZh: '拿铁咖啡', nameEn: 'Caffe latte', category: 'beverage', calories: 45, protein: 2.7, carbs: 4.2, fat: 1.8, aliases: ['拿铁'] },
  { id: 'black-coffee', nameZh: '黑咖啡', nameEn: 'Black coffee', category: 'beverage', calories: 2, protein: 0.1, carbs: 0, fat: 0, aliases: ['美式咖啡', '咖啡'] },
  { id: 'green-tea', nameZh: '绿茶', nameEn: 'Green tea', category: 'beverage', calories: 1, protein: 0, carbs: 0, fat: 0, aliases: ['茶'] },
  { id: 'beer', nameZh: '啤酒', nameEn: 'Beer', category: 'beverage', calories: 43, protein: 0.5, carbs: 3.6, fat: 0, aliases: [] },
  { id: 'red-wine', nameZh: '红酒', nameEn: 'Red wine', category: 'beverage', calories: 85, protein: 0.1, carbs: 2.6, fat: 0, aliases: ['葡萄酒'] },
  { id: 'olive-oil', nameZh: '橄榄油', nameEn: 'Olive oil', category: 'condiment', calories: 884, protein: 0, carbs: 0, fat: 100, aliases: [] },
  { id: 'peanut-oil', nameZh: '花生油', nameEn: 'Peanut oil', category: 'condiment', calories: 884, protein: 0, carbs: 0, fat: 100, aliases: [] },
  { id: 'sesame-oil', nameZh: '芝麻油', nameEn: 'Sesame oil', category: 'condiment', calories: 884, protein: 0, carbs: 0, fat: 100, aliases: ['香油'] },
  { id: 'soy-sauce', nameZh: '酱油', nameEn: 'Soy sauce', category: 'condiment', calories: 53, protein: 8.1, carbs: 4.9, fat: 0.6, aliases: ['生抽'] },
  { id: 'oyster-sauce', nameZh: '蚝油', nameEn: 'Oyster sauce', category: 'condiment', calories: 51, protein: 1.4, carbs: 10.9, fat: 0.3, aliases: [] },
  { id: 'chili-oil', nameZh: '辣椒油', nameEn: 'Chili oil', category: 'condiment', calories: 710, protein: 3.8, carbs: 12.2, fat: 72.4, aliases: ['红油'] },
  { id: 'sesame-paste', nameZh: '芝麻酱', nameEn: 'Sesame paste', category: 'condiment', calories: 630, protein: 19.2, carbs: 22.7, fat: 52.7, aliases: ['麻酱'] },
  { id: 'peanut-butter', nameZh: '花生酱', nameEn: 'Peanut butter', category: 'condiment', calories: 588, protein: 25, carbs: 20, fat: 50, aliases: [] },
  { id: 'ketchup', nameZh: '番茄酱', nameEn: 'Ketchup', category: 'condiment', calories: 112, protein: 1.3, carbs: 26.8, fat: 0.2, aliases: [] },
  { id: 'mayonnaise', nameZh: '蛋黄酱', nameEn: 'Mayonnaise', category: 'condiment', calories: 680, protein: 1, carbs: 0.6, fat: 75, aliases: ['美乃滋'] },
  { id: 'kung-pao-chicken', nameZh: '宫保鸡丁', nameEn: 'Kung pao chicken', category: 'dish', calories: 187, protein: 13.2, carbs: 9.8, fat: 10.4, aliases: [] },
  { id: 'yu-xiang-pork', nameZh: '鱼香肉丝', nameEn: 'Yuxiang shredded pork', category: 'dish', calories: 198, protein: 11.1, carbs: 11.8, fat: 12.1, aliases: [] },
  { id: 'twice-cooked-pork', nameZh: '回锅肉', nameEn: 'Twice-cooked pork', category: 'dish', calories: 236, protein: 10.4, carbs: 7.4, fat: 18.5, aliases: [] },
  { id: 'braised-pork', nameZh: '红烧肉', nameEn: 'Red braised pork belly', category: 'dish', calories: 360, protein: 9.8, carbs: 8.1, fat: 32.4, aliases: [] },
  { id: 'sweet-sour-rib', nameZh: '糖醋排骨', nameEn: 'Sweet and sour pork ribs', category: 'dish', calories: 282, protein: 13.5, carbs: 13.2, fat: 19.2, aliases: [] },
  { id: 'cola-chicken-wing', nameZh: '可乐鸡翅', nameEn: 'Cola chicken wings', category: 'dish', calories: 225, protein: 16.4, carbs: 8.6, fat: 14.2, aliases: [] },
  { id: 'steamed-fish', nameZh: '清蒸鱼', nameEn: 'Steamed fish', category: 'dish', calories: 117, protein: 18.2, carbs: 1.6, fat: 4.4, aliases: [] },
  { id: 'grilled-fish', nameZh: '烤鱼', nameEn: 'Grilled fish', category: 'dish', calories: 178, protein: 18, carbs: 4.5, fat: 9.8, aliases: [] },
  { id: 'boiled-fish', nameZh: '水煮鱼', nameEn: 'Sichuan boiled fish', category: 'dish', calories: 192, protein: 16.5, carbs: 5.8, fat: 11.9, aliases: [] },
  { id: 'hotpot-beef', nameZh: '火锅肥牛', nameEn: 'Hot pot beef slices', category: 'dish', calories: 255, protein: 18, carbs: 2.6, fat: 19.4, aliases: ['肥牛'] },
  { id: 'malatang', nameZh: '麻辣烫', nameEn: 'Malatang', category: 'dish', calories: 118, protein: 6.2, carbs: 10.8, fat: 5.6, aliases: [] },
  { id: 'fried-rice-egg', nameZh: '蛋炒饭', nameEn: 'Egg fried rice', category: 'dish', calories: 188, protein: 5.9, carbs: 27.7, fat: 6.2, aliases: ['炒饭'] },
  { id: 'yangzhou-fried-rice', nameZh: '扬州炒饭', nameEn: 'Yangzhou fried rice', category: 'dish', calories: 176, protein: 6.8, carbs: 25.9, fat: 5.4, aliases: [] },
  { id: 'beef-noodle-soup', nameZh: '牛肉面', nameEn: 'Beef noodle soup', category: 'dish', calories: 145, protein: 8.2, carbs: 19.8, fat: 4.1, aliases: [] },
  { id: 'zhajiangmian', nameZh: '炸酱面', nameEn: 'Zhajiangmian', category: 'dish', calories: 198, protein: 8.1, carbs: 28.4, fat: 5.8, aliases: [] },
  { id: 'dandan-noodle', nameZh: '担担面', nameEn: 'Dan dan noodles', category: 'dish', calories: 226, protein: 8.7, carbs: 29.9, fat: 8.8, aliases: [] },
  { id: 'wonton', nameZh: '馄饨', nameEn: 'Wonton soup', category: 'dish', calories: 106, protein: 5.2, carbs: 14.8, fat: 2.8, aliases: ['云吞'] },
  { id: 'soup-dumpling', nameZh: '小笼包', nameEn: 'Soup dumplings', category: 'dish', calories: 229, protein: 9.6, carbs: 28.2, fat: 8.7, aliases: [] },
  { id: 'shumai', nameZh: '烧麦', nameEn: 'Shumai', category: 'dish', calories: 221, protein: 8.4, carbs: 31.6, fat: 6.8, aliases: ['烧卖'] },
  { id: 'congee-century-egg', nameZh: '皮蛋瘦肉粥', nameEn: 'Century egg pork congee', category: 'dish', calories: 73, protein: 4.1, carbs: 10.9, fat: 1.7, aliases: [] },
  { id: 'claypot-rice', nameZh: '煲仔饭', nameEn: 'Claypot rice', category: 'dish', calories: 193, protein: 7.2, carbs: 28.5, fat: 5.8, aliases: [] },
  { id: 'roast-duck-rice', nameZh: '烧鸭饭', nameEn: 'Roast duck rice', category: 'dish', calories: 228, protein: 9.6, carbs: 24.8, fat: 10.5, aliases: [] },
  { id: 'curry-chicken-rice', nameZh: '咖喱鸡饭', nameEn: 'Chicken curry rice', category: 'dish', calories: 176, protein: 8.1, carbs: 23.5, fat: 5.6, aliases: [] },
  { id: 'bibimbap', nameZh: '石锅拌饭', nameEn: 'Bibimbap', category: 'dish', calories: 158, protein: 6.1, carbs: 24.2, fat: 4.1, aliases: ['拌饭'] },
  { id: 'sushi-roll', nameZh: '寿司卷', nameEn: 'Sushi roll', category: 'dish', calories: 143, protein: 5.2, carbs: 27.8, fat: 1.4, aliases: ['寿司'] },
  { id: 'hamburger', nameZh: '汉堡', nameEn: 'Hamburger', category: 'dish', calories: 254, protein: 12.2, carbs: 27.8, fat: 10.6, aliases: [] },
  { id: 'pizza', nameZh: '披萨', nameEn: 'Pizza', category: 'dish', calories: 266, protein: 11, carbs: 33.3, fat: 10.4, aliases: [] },
  { id: 'fried-chicken', nameZh: '炸鸡', nameEn: 'Fried chicken', category: 'dish', calories: 289, protein: 22.5, carbs: 9.4, fat: 18.1, aliases: [] },
  { id: 'french-fries', nameZh: '薯条', nameEn: 'French fries', category: 'snack', calories: 312, protein: 3.4, carbs: 41.4, fat: 14.7, aliases: [] },
  { id: 'club-sandwich', nameZh: '三明治', nameEn: 'Club sandwich', category: 'dish', calories: 241, protein: 12.6, carbs: 24.9, fat: 10.3, aliases: ['三文治'] },
  { id: 'chicken-salad', nameZh: '鸡肉沙拉', nameEn: 'Chicken salad', category: 'dish', calories: 118, protein: 10.8, carbs: 6.8, fat: 5.4, aliases: ['沙拉'] },
  { id: 'luosifen', nameZh: '螺蛳粉', nameEn: 'Luosifen', category: 'dish', calories: 182, protein: 5.5, carbs: 28.2, fat: 5.6, aliases: [] },
  { id: 'crossing-bridge-noodle', nameZh: '过桥米线', nameEn: 'Crossing-the-bridge rice noodles', category: 'dish', calories: 139, protein: 6.2, carbs: 22.4, fat: 3.1, aliases: ['米线'] },
  { id: 'pho', nameZh: '越南河粉', nameEn: 'Pho', category: 'dish', calories: 92, protein: 6.1, carbs: 13.2, fat: 1.8, aliases: [] },
];

type Variant = {
  suffix: string;
  calorieDelta: number;
  proteinMultiplier?: number;
  carbDelta?: number;
  fatDelta: number;
};

const VARIANTS: Record<FoodCategory, [Variant, Variant]> = {
  staple: [
    { suffix: '（原味）', calorieDelta: 0, fatDelta: 0 },
    { suffix: '（少油做法）', calorieDelta: 35, fatDelta: 3.5 },
  ],
  protein: [
    { suffix: '（清煮/清蒸）', calorieDelta: 0, fatDelta: 0 },
    { suffix: '（香煎）', calorieDelta: 45, fatDelta: 4.5 },
  ],
  vegetable: [
    { suffix: '（白灼）', calorieDelta: 8, fatDelta: 0.3 },
    { suffix: '（清炒）', calorieDelta: 70, fatDelta: 7 },
  ],
  fruit: [
    { suffix: '（鲜食）', calorieDelta: 0, fatDelta: 0 },
    { suffix: '（果昔）', calorieDelta: 18, carbDelta: 4.5, fatDelta: 0 },
  ],
  dairy: [
    { suffix: '（无添加糖）', calorieDelta: 0, fatDelta: 0 },
    { suffix: '（加糖）', calorieDelta: 35, carbDelta: 8.8, fatDelta: 0 },
  ],
  snack: [
    { suffix: '（原味）', calorieDelta: 0, fatDelta: 0 },
    { suffix: '（常规调味）', calorieDelta: 25, carbDelta: 3, fatDelta: 1.5 },
  ],
  dish: [
    { suffix: '（家常少油）', calorieDelta: -12, fatDelta: -1.3 },
    { suffix: '（外卖常规）', calorieDelta: 55, carbDelta: 2, fatDelta: 5.2 },
  ],
  beverage: [
    { suffix: '（少糖）', calorieDelta: -35, carbDelta: -8, fatDelta: 0 },
    { suffix: '（常规）', calorieDelta: 0, fatDelta: 0 },
  ],
  condiment: [
    { suffix: '（少量使用）', calorieDelta: 0, fatDelta: 0 },
    { suffix: '（重口味使用）', calorieDelta: 20, carbDelta: 2, fatDelta: 1 },
  ],
};

function applyVariant(seed: FoodSeed, variant: Variant, index: number): FoodCatalogItem {
  const sourceReference = seed.sourceReference ?? CATEGORY_SOURCE_REFERENCES[seed.category];
  return {
    id: `${seed.id}-v${index + 1}`,
    nameZh: `${seed.nameZh}${variant.suffix}`,
    nameEn: seed.nameEn,
    category: seed.category,
    aliases: index === 0 ? seed.aliases : [],
    sourceReference: `${sourceReference}；做法变体按常见烹调用油/糖调整，保存前请按实际配方修正`,
    calories: Math.max(0, round(seed.calories + variant.calorieDelta, 0)),
    protein: Math.max(0, round(seed.protein * (variant.proteinMultiplier ?? 1), 1)),
    carbs: Math.max(0, round(seed.carbs + (variant.carbDelta ?? 0), 1)),
    fat: Math.max(0, round(seed.fat + variant.fatDelta, 1)),
  };
}

export const FOOD_CATALOG: FoodCatalogItem[] = SEEDS.flatMap((seed) => {
  const sourceReference = seed.sourceReference ?? CATEGORY_SOURCE_REFERENCES[seed.category];
  const base: FoodCatalogItem = {
    ...seed,
    sourceReference,
  };
  return [
    base,
    applyVariant(seed, VARIANTS[seed.category][0], 0),
    applyVariant(seed, VARIANTS[seed.category][1], 1),
  ];
});

export function normalizeFoodName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s（）()、，,·]/g, '');
}

export function searchCatalog(query: string, limit = 20): FoodCatalogItem[] {
  const normalized = normalizeFoodName(query);
  if (!normalized) {
    return FOOD_CATALOG.slice(0, limit);
  }
  return FOOD_CATALOG.filter((food) => {
    const candidates = [food.nameZh, food.nameEn ?? '', ...food.aliases];
    return candidates.some((candidate) => normalizeFoodName(candidate).includes(normalized));
  }).slice(0, limit);
}

export function findBestCatalogMatch(name: string): FoodCatalogItem | undefined {
  const normalized = normalizeFoodName(name);
  if (!normalized) {
    return undefined;
  }
  return FOOD_CATALOG.find((food) =>
    [food.nameZh, food.nameEn ?? '', ...food.aliases].some(
      (candidate) => normalizeFoodName(candidate) === normalized,
    ),
  ) ?? searchCatalog(name, 1)[0];
}
