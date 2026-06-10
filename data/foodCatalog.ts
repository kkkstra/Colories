import type { FoodCatalogItem, MacroValues } from '@/types/domain';
import { round } from '@/lib/nutrition';

type FoodSeed = MacroValues & {
  id: string;
  nameZh: string;
  nameEn: string;
  category: 'staple' | 'protein' | 'vegetable' | 'fruit' | 'dairy' | 'snack' | 'dish';
  aliases: string[];
};

const SOURCE = 'USDA FoodData Central (CC0), 中文本地化估算';

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
];

type Variant = {
  suffix: string;
  calorieDelta: number;
  proteinMultiplier?: number;
  carbDelta?: number;
  fatDelta: number;
};

const VARIANTS: Record<FoodSeed['category'], [Variant, Variant]> = {
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
};

function applyVariant(seed: FoodSeed, variant: Variant, index: number): FoodCatalogItem {
  return {
    id: `${seed.id}-v${index + 1}`,
    nameZh: `${seed.nameZh}${variant.suffix}`,
    nameEn: seed.nameEn,
    category: seed.category,
    aliases: index === 0 ? seed.aliases : [],
    sourceReference: SOURCE,
    calories: Math.max(0, round(seed.calories + variant.calorieDelta, 0)),
    protein: Math.max(0, round(seed.protein * (variant.proteinMultiplier ?? 1), 1)),
    carbs: Math.max(0, round(seed.carbs + (variant.carbDelta ?? 0), 1)),
    fat: Math.max(0, round(seed.fat + variant.fatDelta, 1)),
  };
}

export const FOOD_CATALOG: FoodCatalogItem[] = SEEDS.flatMap((seed) => {
  const base: FoodCatalogItem = {
    ...seed,
    sourceReference: SOURCE,
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
