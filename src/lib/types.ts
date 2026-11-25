export type Role = "manager" | "member";

/** Fine-grained permissions a custom role can grant. Managers have all of them. */
export const PERMISSIONS = ["meals", "bazar", "deposits", "costs", "members", "roster", "notices", "month", "settings"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type MessRole = { id: string; mess_id: string; name: string; permissions: Permission[] };

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  locale: "bn" | "en";
  is_super_admin: boolean;
  must_change_password: boolean;
  username: string | null;
  avatar_url: string | null;
};
export type PaymentMethod = "cash" | "bkash" | "nagad" | "rocket" | "bank" | "other";
export type DepositStatus = "pending" | "approved" | "rejected";

export type Mess = {
  id: string;
  name: string;
  address: string | null;
  invite_code: string;
  breakfast_enabled: boolean;
  breakfast_weight: number;
  lunch_weight: number;
  dinner_weight: number;
  breakfast_cutoff: string;
  lunch_cutoff: string;
  dinner_cutoff: string;
  created_at: string;
  meal_rate_rounding: "exact" | "sheet";
  low_meal_days: number;
  dues_reminder_day: number | null;
  dues_reminder_time: number;
  duty_reminder_time: number | null;
  cutoff_reminder_min: number | null;
  new_member_breakfast: boolean;
  new_member_lunch: boolean;
  new_member_dinner: boolean;
};

export type Member = {
  id: string;
  mess_id: string;
  user_id: string | null;
  display_name: string;
  phone: string | null;
  role: Role;
  role_id: string | null;
  room: string | null;
  status: "active" | "left";
  joined_on: string;
  left_on: string | null;
  default_breakfast: boolean;
  default_lunch: boolean;
  default_dinner: boolean;
  claim_code: string | null;
};

export type Meal = {
  id: string;
  member_id: string;
  date: string;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  guest_breakfast: number;
  guest_lunch: number;
  guest_dinner: number;
  /** a meal that is on but counts 0.5 */
  half_breakfast: boolean;
  half_lunch: boolean;
  half_dinner: boolean;
  source: "auto" | "member" | "manager";
};

export type MealKind = "breakfast" | "lunch" | "dinner";

export type MemberSummary = {
  member_id: string;
  display_name: string;
  room: string | null;
  meals: number;
  meal_cost: number;
  fixed_share: number;
  deposits: number;
  carry_in: number;
  balance: number;
};

export type MonthSummary = {
  month: string;
  status: "open" | "closed";
  closed_at: string | null;
  total_bazar: number;
  total_meals: number;
  meal_rate: number;
  total_fixed: number;
  total_deposits: number;
  prev_month_closed: boolean;
  members: MemberSummary[];
};
