/**
 * Hand-written Database types matching db/migrations schema.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type StorePreference = "king_soopers" | "whole_foods" | "costco" | "any";

export type PlanStatus =
  "draft" | "approved" | "grocery_generated" | "completed" | "archived";

export type DayProfileType =
  | "normal"
  | "workday"
  | "long_day"
  | "quick_cook"
  | "reheat_only"
  | "eating_out"
  | "custom";

export type MealType =
  "breakfast" | "lunch" | "dinner" | "snack_prep" | "other";

export type RecipeSourceType =
  "household" | "family" | "ai" | "imported" | "transcribed";

export type Difficulty = "easy" | "medium" | "hard";
export type WouldMakeAgain = "yes" | "maybe" | "no";
export type GroceryListStatus = "active" | "completed" | "archived";
export type PantryStatus = "needed" | "owned" | "purchased";
export type AiOutputStatus = "success" | "error" | "validation_failed";
export type AssignmentScope = "both" | "specific";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snacks";

export type DayMealNeeds = {
  defaultMeals: MealSlot[];
  weekdayMeals: MealSlot[] | null;
  weekendMeals: MealSlot[] | null;
  workingDayMods: {
    add: MealSlot[];
    remove: MealSlot[];
  };
};

export type AppetiteLevel = "light" | "normal" | "heavy";

export type AppetitePrefs = {
  meat: AppetiteLevel;
  veggies: AppetiteLevel;
  dairy: AppetiteLevel;
  other: AppetiteLevel;
};

export type MealDefaultOption = {
  title: string;
  recipeId?: string;
};

export type MealDefaults = {
  breakfast: MealDefaultOption[];
  lunch: MealDefaultOption[];
  dinner: MealDefaultOption[];
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          email: string | null;
          avatar_url: string | null;
          dietary_restrictions: string[];
          ingredient_dislikes: string[];
          ingredient_preferences: string[];
          favorite_cuisines: string[];
          nutrition_notes: string | null;
          portion_multiplier: number;
          day_meal_needs: DayMealNeeds;
          appetite_prefs: AppetitePrefs;
          meal_defaults: MealDefaults;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          dietary_restrictions?: string[];
          ingredient_dislikes?: string[];
          ingredient_preferences?: string[];
          favorite_cuisines?: string[];
          nutrition_notes?: string | null;
          portion_multiplier?: number;
          day_meal_needs?: DayMealNeeds;
          appetite_prefs?: AppetitePrefs;
          meal_defaults?: MealDefaults;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      households: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["households"]["Insert"]>;
        Relationships: [];
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          role: "member" | "admin";
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          role?: "member" | "admin";
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["household_members"]["Insert"]
        >;
        Relationships: [];
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          household_id: string;
          notify_meals_added: boolean;
          notify_plan_approved: boolean;
          notify_grocery_generated: boolean;
          notify_grocery_changed: boolean;
          notify_meal_review: boolean;
          email_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          household_id: string;
          notify_meals_added?: boolean;
          notify_plan_approved?: boolean;
          notify_grocery_generated?: boolean;
          notify_grocery_changed?: boolean;
          notify_meal_review?: boolean;
          email_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["user_preferences"]["Insert"]
        >;
        Relationships: [];
      };
      recipes: {
        Row: {
          id: string;
          household_id: string;
          title: string;
          description: string | null;
          source_type: RecipeSourceType;
          source_name: string | null;
          cuisine: string | null;
          meal_types: string[];
          dietary_tags: string[];
          is_favorite: boolean;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          title: string;
          description?: string | null;
          source_type: RecipeSourceType;
          source_name?: string | null;
          cuisine?: string | null;
          meal_types?: string[];
          dietary_tags?: string[];
          is_favorite?: boolean;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recipes"]["Insert"]>;
        Relationships: [];
      };
      recipe_likes: {
        Row: {
          id: string;
          user_id: string;
          recipe_id: string;
          household_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          recipe_id: string;
          household_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recipe_likes"]["Insert"]>;
        Relationships: [];
      };
      recipe_versions: {
        Row: {
          id: string;
          recipe_id: string;
          household_id: string;
          version_number: number;
          is_current: boolean;
          change_summary: string | null;
          default_servings: number | null;
          prep_time_minutes: number | null;
          cook_time_minutes: number | null;
          total_time_minutes: number | null;
          equipment: string[];
          storage_instructions: string | null;
          reheating_instructions: string | null;
          freezing_suitable: boolean | null;
          leftover_notes: string | null;
          difficulty: Difficulty | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          household_id: string;
          version_number: number;
          is_current?: boolean;
          change_summary?: string | null;
          default_servings?: number | null;
          prep_time_minutes?: number | null;
          cook_time_minutes?: number | null;
          total_time_minutes?: number | null;
          equipment?: string[];
          storage_instructions?: string | null;
          reheating_instructions?: string | null;
          freezing_suitable?: boolean | null;
          leftover_notes?: string | null;
          difficulty?: Difficulty | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["recipe_versions"]["Insert"]
        >;
        Relationships: [];
      };
      recipe_ingredients: {
        Row: {
          id: string;
          recipe_version_id: string;
          household_id: string;
          raw_text: string | null;
          ingredient_name: string;
          quantity: number | null;
          unit: string | null;
          preparation_note: string | null;
          optional: boolean;
          grocery_category: string | null;
          preferred_store: StorePreference | null;
          costco_bulk_candidate: boolean;
          sort_order: number;
        };
        Insert: {
          id?: string;
          recipe_version_id: string;
          household_id: string;
          raw_text?: string | null;
          ingredient_name: string;
          quantity?: number | null;
          unit?: string | null;
          preparation_note?: string | null;
          optional?: boolean;
          grocery_category?: string | null;
          preferred_store?: StorePreference | null;
          costco_bulk_candidate?: boolean;
          sort_order?: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["recipe_ingredients"]["Insert"]
        >;
        Relationships: [];
      };
      recipe_steps: {
        Row: {
          id: string;
          recipe_version_id: string;
          household_id: string;
          step_number: number;
          instruction: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipe_version_id: string;
          household_id: string;
          step_number: number;
          instruction: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recipe_steps"]["Insert"]>;
        Relationships: [];
      };
      weekly_plans: {
        Row: {
          id: string;
          household_id: string;
          week_start: string;
          status: PlanStatus;
          approved_at: string | null;
          approved_by: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          week_start: string;
          status?: PlanStatus;
          approved_at?: string | null;
          approved_by?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["weekly_plans"]["Insert"]>;
        Relationships: [];
      };
      plan_days: {
        Row: {
          id: string;
          weekly_plan_id: string;
          household_id: string;
          day_date: string;
          profile_type: DayProfileType;
          applies_to: AssignmentScope;
          applies_to_user_id: string | null;
          max_active_cook_minutes: number | null;
          max_total_cook_minutes: number | null;
          needs_meal_prep: boolean;
          needs_portable_snacks: boolean;
          reheat_only: boolean;
          working_user_ids: string[];
          notes: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          weekly_plan_id: string;
          household_id: string;
          day_date: string;
          profile_type?: DayProfileType;
          applies_to?: AssignmentScope;
          applies_to_user_id?: string | null;
          max_active_cook_minutes?: number | null;
          max_total_cook_minutes?: number | null;
          needs_meal_prep?: boolean;
          needs_portable_snacks?: boolean;
          reheat_only?: boolean;
          working_user_ids?: string[];
          notes?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["plan_days"]["Insert"]>;
        Relationships: [];
      };
      planned_meals: {
        Row: {
          id: string;
          plan_day_id: string;
          weekly_plan_id: string;
          household_id: string;
          meal_type: MealType;
          assigned_to: AssignmentScope;
          assigned_to_user_id: string | null;
          title: string;
          recipe_id: string | null;
          recipe_version_id: string | null;
          servings: number | null;
          notes: string | null;
          is_leftovers: boolean;
          leftover_from_meal_id: string | null;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          plan_day_id: string;
          weekly_plan_id: string;
          household_id: string;
          meal_type: MealType;
          assigned_to?: AssignmentScope;
          assigned_to_user_id?: string | null;
          title: string;
          recipe_id?: string | null;
          recipe_version_id?: string | null;
          servings?: number | null;
          notes?: string | null;
          is_leftovers?: boolean;
          leftover_from_meal_id?: string | null;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["planned_meals"]["Insert"]
        >;
        Relationships: [];
      };
      meal_history: {
        Row: {
          id: string;
          household_id: string;
          planned_meal_id: string | null;
          recipe_id: string | null;
          recipe_version_id: string | null;
          cooked_at: string;
          cooked_for: AssignmentScope;
          cooked_for_user_id: string | null;
          cooked_by: string | null;
          overall_rating: number | null;
          review: string | null;
          would_make_again: WouldMakeAgain | null;
          tags: string[];
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          planned_meal_id?: string | null;
          recipe_id?: string | null;
          recipe_version_id?: string | null;
          cooked_at?: string;
          cooked_for?: AssignmentScope;
          cooked_for_user_id?: string | null;
          cooked_by?: string | null;
          overall_rating?: number | null;
          review?: string | null;
          would_make_again?: WouldMakeAgain | null;
          tags?: string[];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meal_history"]["Insert"]>;
        Relationships: [];
      };
      meal_history_participants: {
        Row: {
          id: string;
          meal_history_id: string;
          household_id: string;
          user_id: string;
          individual_rating: number | null;
        };
        Insert: {
          id?: string;
          meal_history_id: string;
          household_id: string;
          user_id: string;
          individual_rating?: number | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["meal_history_participants"]["Insert"]
        >;
        Relationships: [];
      };
      meal_photos: {
        Row: {
          id: string;
          meal_history_id: string;
          household_id: string;
          storage_path: string;
          thumbnail_path: string | null;
          mime_type: string | null;
          file_size_bytes: number | null;
          width: number | null;
          height: number | null;
          alt_text: string | null;
          sort_order: number;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          meal_history_id: string;
          household_id: string;
          storage_path: string;
          thumbnail_path?: string | null;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          width?: number | null;
          height?: number | null;
          alt_text?: string | null;
          sort_order?: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meal_photos"]["Insert"]>;
        Relationships: [];
      };
      grocery_lists: {
        Row: {
          id: string;
          household_id: string;
          weekly_plan_id: string | null;
          status: GroceryListStatus;
          generated_at: string | null;
          generated_by: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          weekly_plan_id?: string | null;
          status?: GroceryListStatus;
          generated_at?: string | null;
          generated_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["grocery_lists"]["Insert"]
        >;
        Relationships: [];
      };
      grocery_items: {
        Row: {
          id: string;
          grocery_list_id: string;
          household_id: string;
          name: string;
          quantity: number | null;
          unit: string | null;
          section: string | null;
          preferred_store: StorePreference | null;
          costco_bulk_candidate: boolean;
          pantry_status: PantryStatus;
          is_checked: boolean;
          checked_by: string | null;
          checked_at: string | null;
          assigned_shopper: string | null;
          notes: string | null;
          is_manual: boolean;
          is_user_edited: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          grocery_list_id: string;
          household_id: string;
          name: string;
          quantity?: number | null;
          unit?: string | null;
          section?: string | null;
          preferred_store?: StorePreference | null;
          costco_bulk_candidate?: boolean;
          pantry_status?: PantryStatus;
          is_checked?: boolean;
          checked_by?: string | null;
          checked_at?: string | null;
          assigned_shopper?: string | null;
          notes?: string | null;
          is_manual?: boolean;
          is_user_edited?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["grocery_items"]["Insert"]
        >;
        Relationships: [];
      };
      grocery_item_sources: {
        Row: {
          id: string;
          grocery_item_id: string;
          household_id: string;
          planned_meal_id: string | null;
          recipe_ingredient_id: string | null;
          original_quantity: number | null;
          original_unit: string | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          grocery_item_id: string;
          household_id: string;
          planned_meal_id?: string | null;
          recipe_ingredient_id?: string | null;
          original_quantity?: number | null;
          original_unit?: string | null;
          note?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["grocery_item_sources"]["Insert"]
        >;
        Relationships: [];
      };
      store_preferences: {
        Row: {
          id: string;
          household_id: string;
          ingredient_name: string;
          preferred_store: StorePreference;
          costco_bulk_preferred: boolean;
          notes: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          ingredient_name: string;
          preferred_store?: StorePreference;
          costco_bulk_preferred?: boolean;
          notes?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["store_preferences"]["Insert"]
        >;
        Relationships: [];
      };
      ai_generations: {
        Row: {
          id: string;
          household_id: string;
          requested_by: string | null;
          operation_type: string;
          related_plan_id: string | null;
          related_recipe_id: string | null;
          related_meal_idea_id: string | null;
          related_week_start: string | null;
          model: string | null;
          input_summary: string | null;
          output_status: AiOutputStatus | "pending";
          request_hash: string | null;
          openai_request_id: string | null;
          input_tokens: number | null;
          cached_input_tokens: number | null;
          output_tokens: number | null;
          estimated_cost_usd: number | null;
          error_category: string | null;
          usage_missing: boolean;
          token_usage: Json | null;
          error_details: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          requested_by?: string | null;
          operation_type: string;
          related_plan_id?: string | null;
          related_recipe_id?: string | null;
          related_meal_idea_id?: string | null;
          related_week_start?: string | null;
          model?: string | null;
          input_summary?: string | null;
          output_status: AiOutputStatus | "pending";
          request_hash?: string | null;
          openai_request_id?: string | null;
          input_tokens?: number | null;
          cached_input_tokens?: number | null;
          output_tokens?: number | null;
          estimated_cost_usd?: number | null;
          error_category?: string | null;
          usage_missing?: boolean;
          token_usage?: Json | null;
          error_details?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ai_generations"]["Insert"]
        >;
        Relationships: [];
      };
      ai_meal_ideas: {
        Row: {
          id: string;
          household_id: string;
          weekly_plan_id: string;
          generation_id: string | null;
          generated_id: string;
          name: string;
          description: string;
          cuisine: string | null;
          prep_time_minutes: number | null;
          cook_time_minutes: number | null;
          difficulty: Difficulty | null;
          primary_protein: string | null;
          ingredient_preview: string[];
          applicable_members: string[];
          fit_reason: string | null;
          status: "pending_review" | "approved" | "rejected" | "replaced";
          recipe_id: string | null;
          replaced_by_idea_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          weekly_plan_id: string;
          generation_id?: string | null;
          generated_id: string;
          name: string;
          description: string;
          cuisine?: string | null;
          prep_time_minutes?: number | null;
          cook_time_minutes?: number | null;
          difficulty?: Difficulty | null;
          primary_protein?: string | null;
          ingredient_preview?: string[];
          applicable_members?: string[];
          fit_reason?: string | null;
          status?: "pending_review" | "approved" | "rejected" | "replaced";
          recipe_id?: string | null;
          replaced_by_idea_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ai_meal_ideas"]["Insert"]
        >;
        Relationships: [];
      };
      ai_generated_recipes: {
        Row: {
          id: string;
          household_id: string;
          meal_idea_id: string;
          generation_id: string | null;
          recipe_id: string;
          payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          meal_idea_id: string;
          generation_id?: string | null;
          recipe_id: string;
          payload: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ai_generated_recipes"]["Insert"]
        >;
        Relationships: [];
      };
      ai_usage_ledger: {
        Row: {
          id: string;
          household_id: string | null;
          generation_id: string | null;
          operation_type: string;
          model: string;
          input_tokens: number | null;
          cached_input_tokens: number | null;
          output_tokens: number | null;
          estimated_cost_usd: number;
          usage_missing: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id?: string | null;
          generation_id?: string | null;
          operation_type: string;
          model: string;
          input_tokens?: number | null;
          cached_input_tokens?: number | null;
          output_tokens?: number | null;
          estimated_cost_usd: number;
          usage_missing?: boolean;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ai_usage_ledger"]["Insert"]
        >;
        Relationships: [];
      };
      ai_response_cache: {
        Row: {
          id: string;
          request_hash: string;
          operation_type: string;
          query_normalized: string;
          status: "familiar" | "unfamiliar";
          payload: Json;
          generation_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          request_hash: string;
          operation_type: string;
          query_normalized: string;
          status: "familiar" | "unfamiliar";
          payload?: Json;
          generation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ai_response_cache"]["Insert"]
        >;
        Relationships: [];
      };
      household_activity: {
        Row: {
          id: string;
          household_id: string;
          actor_user_id: string | null;
          action_type: string;
          entity_type: string;
          entity_id: string | null;
          parent_entity_type: string | null;
          parent_entity_id: string | null;
          summary: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          actor_user_id?: string | null;
          action_type: string;
          entity_type: string;
          entity_id?: string | null;
          parent_entity_type?: string | null;
          parent_entity_id?: string | null;
          summary: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["household_activity"]["Insert"]
        >;
        Relationships: [];
      };
      notification_events: {
        Row: {
          id: string;
          household_id: string;
          event_type: string;
          payload: Json | null;
          dedupe_key: string;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          event_type: string;
          payload?: Json | null;
          dedupe_key: string;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["notification_events"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_household_member: {
        Args: { p_household_id: string };
        Returns: boolean;
      };
      shares_household_with: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Profile = Tables<"profiles">;
export type Household = Tables<"households">;
export type HouseholdMember = Tables<"household_members">;
export type UserPreferences = Tables<"user_preferences">;
export type Recipe = Tables<"recipes">;
export type RecipeLike = Tables<"recipe_likes">;
export type RecipeVersion = Tables<"recipe_versions">;
export type RecipeIngredient = Tables<"recipe_ingredients">;
export type RecipeStep = Tables<"recipe_steps">;
export type WeeklyPlan = Tables<"weekly_plans">;
export type PlanDay = Tables<"plan_days">;
export type PlannedMeal = Tables<"planned_meals">;
export type MealHistory = Tables<"meal_history">;
export type MealPhoto = Tables<"meal_photos">;
export type GroceryList = Tables<"grocery_lists">;
export type GroceryItem = Tables<"grocery_items">;
export type AiGeneration = Tables<"ai_generations">;
export type AiMealIdea = Tables<"ai_meal_ideas">;
export type AiGeneratedRecipe = Tables<"ai_generated_recipes">;
export type AiUsageLedger = Tables<"ai_usage_ledger">;
export type AiResponseCache = Tables<"ai_response_cache">;
export type HouseholdActivity = Tables<"household_activity">;
