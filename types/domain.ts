export type BiologicalSex = 'male' | 'female';
export type FitnessGoal = 'cut' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type NutritionSource = 'catalog' | 'ai' | 'manual';
export type AIResponseMode = 'json_schema' | 'json_object' | 'prompt_json';
export type FoodCategory =
  | 'staple'
  | 'protein'
  | 'vegetable'
  | 'fruit'
  | 'dairy'
  | 'snack'
  | 'dish'
  | 'beverage'
  | 'condiment';

export interface MacroValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface UserProfile {
  age: number;
  heightCm: number;
  weightKg: number;
  sex: BiologicalSex;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
}

export interface DailyTargets extends MacroValues {
  date?: string;
}

export interface FoodCatalogItem extends MacroValues {
  id: string;
  nameZh: string;
  nameEn?: string;
  category: FoodCategory;
  aliases: string[];
  sourceReference: string;
  isCustom?: boolean;
}

export type MealItemRecognitionChoice = 'ai' | 'catalog';

export interface MealItemRecognitionOption extends MacroValues {
  name: string;
  source: NutritionSource;
  catalogFoodId?: string;
  warning?: string;
}

export interface MealItemRecognitionAlternatives {
  selected: MealItemRecognitionChoice;
  ai: MealItemRecognitionOption;
  catalog: MealItemRecognitionOption;
}

export interface MealItemDraft extends MacroValues {
  id: string;
  name: string;
  weightGrams: number;
  source: NutritionSource;
  confidence?: number;
  cookingMethod?: string;
  catalogFoodId?: string;
  warning?: string;
  recognitionAlternatives?: MealItemRecognitionAlternatives;
}

export interface MealRecord {
  id: number;
  eatenAt: string;
  mealType: MealType;
  title?: string;
  photoUri?: string;
  notes?: string;
  items: MealItemDraft[];
  totals: MacroValues;
}

export interface NutritionWidgetSnapshot {
  dateKey: string;
  consumedCalories: number;
  targetCalories: number;
  remainingCalories: number;
  calorieProgress: number;
  protein: number;
  proteinTarget: number;
  proteinProgress: number;
  carbs: number;
  carbsTarget: number;
  carbsProgress: number;
  fat: number;
  fatTarget: number;
  fatProgress: number;
  statusLabel: string;
  updatedAtLabel: string;
  hasTargets: boolean;
}

export interface AIProviderConfig {
  baseUrl: string;
  model: string;
  responseMode: AIResponseMode;
}

export interface AIRecognizedFood {
  name: string;
  estimatedWeightGrams: number;
  cookingMethod: string;
  confidence: number;
  nutrition: MacroValues;
  warning?: string;
}

export interface FoodRecognitionResult {
  mealTitle?: string;
  foods: AIRecognizedFood[];
  warnings: string[];
}
