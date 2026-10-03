
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "fixed_task_templates": {
                  Row: {
                    "active": boolean,"allow_employee_note": boolean,"assignee_id": string,"created_at": string,"created_by": string | null,"due_time": string | null,"id": string,"note": string | null,"sort_order": number,"title": string,"updated_at": string,"weekdays": (number)[]
                  }
                  Insert: {
                    "active"?: boolean,"allow_employee_note"?: boolean,"assignee_id": string,"created_at"?: string,"created_by"?: string | null,"due_time"?: string | null,"id"?: string,"note"?: string | null,"sort_order"?: number,"title": string,"updated_at"?: string,"weekdays"?: (number)[]
                  }
                  Update: {
                    "active"?: boolean,"allow_employee_note"?: boolean,"assignee_id"?: string,"created_at"?: string,"created_by"?: string | null,"due_time"?: string | null,"id"?: string,"note"?: string | null,"sort_order"?: number,"title"?: string,"updated_at"?: string,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixed_task_templates_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_task_templates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"avatar_url": string | null,"created_at": string,"email": string,"full_name": string,"id": string,"notification_enabled": boolean,"role": Database["public"]['Enums']["app_role"],"updated_at": string,"zalo_connected": boolean,"zalo_user_id": string | null
                  }
                  Insert: {
                    "active"?: boolean,"avatar_url"?: string | null,"created_at"?: string,"email": string,"full_name"?: string,"id": string,"notification_enabled"?: boolean,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string,"zalo_connected"?: boolean,"zalo_user_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"avatar_url"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"notification_enabled"?: boolean,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string,"zalo_connected"?: boolean,"zalo_user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"tasks": {
                  Row: {
                    "allow_employee_note": boolean,"assignee_id": string,"completed_at": string | null,"completed_by": string | null,"created_at": string,"created_by": string | null,"due_at": string | null,"employee_note": string | null,"id": string,"note": string | null,"sort_order": number,"status": Database["public"]['Enums']["task_status"],"task_date": string,"template_id": string | null,"title": string,"type": Database["public"]['Enums']["task_type"],"updated_at": string,"display_status": Database["public"]['Enums']["task_display_status"] | null
                  }
                  Insert: {
                    "allow_employee_note"?: boolean,"assignee_id"?: string,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"due_at"?: string | null,"employee_note"?: string | null,"id"?: string,"note"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["task_status"],"task_date"?: string,"template_id"?: string | null,"title": string,"type": Database["public"]['Enums']["task_type"],"updated_at"?: string
                  }
                  Update: {
                    "allow_employee_note"?: boolean,"assignee_id"?: string,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"due_at"?: string | null,"employee_note"?: string | null,"id"?: string,"note"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["task_status"],"task_date"?: string,"template_id"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["task_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_completed_by_fkey"
      columns: ["completed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "fixed_task_templates"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "app_health":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"display_status":
{ Args: { "t": Database["public"]['Tables']["tasks"]['Row'] }; Returns: Database["public"]['Enums']["task_display_status"]
                           },
"ensure_today_fixed_tasks":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"reorder_fixed_task_templates":
{ Args: { "p_assignee_id": string,"p_ids": (string)[] }; Returns: undefined
                           }
          }
          Enums: {
            "app_role": "ADMIN"|"EMPLOYEE","task_display_status": "UPCOMING"|"TODAY"|"OVERDUE"|"COMPLETED","task_status": "TODO"|"DONE","task_type": "FIXED"|"ADHOC"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_role": ["ADMIN", "EMPLOYEE"],"task_display_status": ["UPCOMING", "TODAY", "OVERDUE", "COMPLETED"],"task_status": ["TODO", "DONE"],"task_type": ["FIXED", "ADHOC"]
          }
        }
} as const
