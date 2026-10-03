
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "fixed_task_templates": {
                  Row: {
                    "active": boolean,"allow_employee_note": boolean,"assignee_id": string,"created_at": string,"created_by": string | null,"days_of_week": (number)[],"default_note": string | null,"due_time": string | null,"effective_from": string,"effective_to": string | null,"id": string,"sort_order": number,"title": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"allow_employee_note"?: boolean,"assignee_id": string,"created_at"?: string,"created_by"?: string | null,"days_of_week"?: (number)[],"default_note"?: string | null,"due_time"?: string | null,"effective_from"?: string,"effective_to"?: string | null,"id"?: string,"sort_order"?: number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"allow_employee_note"?: boolean,"assignee_id"?: string,"created_at"?: string,"created_by"?: string | null,"days_of_week"?: (number)[],"default_note"?: string | null,"due_time"?: string | null,"effective_from"?: string,"effective_to"?: string | null,"id"?: string,"sort_order"?: number,"title"?: string,"updated_at"?: string
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
                },"notification_logs": {
                  Row: {
                    "channel": Database["public"]['Enums']["notification_channel"],"created_at": string,"dedupe_key": string | null,"error": string | null,"id": number,"kind": string,"payload": Json | null,"sent_at": string | null,"status": Database["public"]['Enums']["notification_status"],"task_id": string | null,"user_id": string
                  }
                  Insert: {
                    "channel": Database["public"]['Enums']["notification_channel"],"created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"id"?: never,"kind": string,"payload"?: Json | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"task_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"id"?: never,"kind"?: string,"payload"?: Json | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"task_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_logs_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_logs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_settings": {
                  Row: {
                    "created_at": string,"daily_summary_enabled": boolean,"daily_summary_time": string,"deadline_reminder_enabled": boolean,"overdue_alert_enabled": boolean,"remind_before_minutes": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"daily_summary_enabled"?: boolean,"daily_summary_time"?: string,"deadline_reminder_enabled"?: boolean,"overdue_alert_enabled"?: boolean,"remind_before_minutes"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"daily_summary_enabled"?: boolean,"daily_summary_time"?: string,"deadline_reminder_enabled"?: boolean,"overdue_alert_enabled"?: boolean,"remind_before_minutes"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
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
                },"system_settings": {
                  Row: {
                    "description": string | null,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  Insert: {
                    "description"?: string | null,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "system_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"task_history": {
                  Row: {
                    "action": Database["public"]['Enums']["task_action"],"actor_id": string | null,"created_at": string,"id": number,"new_data": Json | null,"old_data": Json | null,"task_id": string
                  }
                  Insert: {
                    "action": Database["public"]['Enums']["task_action"],"actor_id"?: string | null,"created_at"?: string,"id"?: never,"new_data"?: Json | null,"old_data"?: Json | null,"task_id": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["task_action"],"actor_id"?: string | null,"created_at"?: string,"id"?: never,"new_data"?: Json | null,"old_data"?: Json | null,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_history_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_history_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "allow_employee_note": boolean,"assignee_id": string,"completed": boolean,"completed_at": string | null,"completed_by": string | null,"created_at": string,"created_by": string | null,"deadline_at": string | null,"employee_note": string | null,"fixed_template_id": string | null,"id": string,"note": string | null,"sort_order": number,"task_date": string | null,"title": string,"type": Database["public"]['Enums']["task_type"],"updated_at": string,"display_status": Database["public"]['Enums']["task_display_status"] | null
                  }
                  Insert: {
                    "allow_employee_note"?: boolean,"assignee_id"?: string,"completed"?: boolean,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"deadline_at"?: string | null,"employee_note"?: string | null,"fixed_template_id"?: string | null,"id"?: string,"note"?: string | null,"sort_order"?: number,"task_date"?: string | null,"title": string,"type": Database["public"]['Enums']["task_type"],"updated_at"?: string
                  }
                  Update: {
                    "allow_employee_note"?: boolean,"assignee_id"?: string,"completed"?: boolean,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"deadline_at"?: string | null,"employee_note"?: string | null,"fixed_template_id"?: string | null,"id"?: string,"note"?: string | null,"sort_order"?: number,"task_date"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["task_type"],"updated_at"?: string
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
      columns: ["fixed_template_id"]
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
            "app_role": "ADMIN"|"EMPLOYEE","notification_channel": "ZALO"|"IN_APP","notification_status": "PENDING"|"SENT"|"FAILED"|"SKIPPED","task_action": "CREATED"|"UPDATED"|"RESCHEDULED"|"COMPLETED"|"REOPENED","task_display_status": "UPCOMING"|"TODAY"|"OVERDUE"|"COMPLETED","task_type": "FIXED"|"ADHOC"
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
            "app_role": ["ADMIN", "EMPLOYEE"],"notification_channel": ["ZALO", "IN_APP"],"notification_status": ["PENDING", "SENT", "FAILED", "SKIPPED"],"task_action": ["CREATED", "UPDATED", "RESCHEDULED", "COMPLETED", "REOPENED"],"task_display_status": ["UPCOMING", "TODAY", "OVERDUE", "COMPLETED"],"task_type": ["FIXED", "ADHOC"]
          }
        }
} as const
