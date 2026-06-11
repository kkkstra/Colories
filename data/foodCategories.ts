import type { FoodCategory } from '@/types/domain';

export const FOOD_CATEGORY_OPTIONS: { label: string; value: FoodCategory }[] = [
  { label: '主食', value: 'staple' },
  { label: '蛋白', value: 'protein' },
  { label: '蔬菜', value: 'vegetable' },
  { label: '水果', value: 'fruit' },
  { label: '奶类', value: 'dairy' },
  { label: '零食', value: 'snack' },
  { label: '菜品', value: 'dish' },
  { label: '饮品', value: 'beverage' },
  { label: '调味', value: 'condiment' },
];

export const FOOD_CATEGORY_LABELS = Object.fromEntries(
  FOOD_CATEGORY_OPTIONS.map((category) => [category.value, category.label]),
) as Record<FoodCategory, string>;
