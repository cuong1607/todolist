
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
                    "claimed_at": string | null,"created_at": string,"dedupe_key": string | null,"error": string | null,"external_message_id": string | null,"failed_at": string | null,"id": number,"payload": Json | null,"provider": Database["public"]['Enums']["notification_provider"],"retry_count": number,"scheduled_at": string,"sent_at": string | null,"status": Database["public"]['Enums']["notification_status"],"task_id": string | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Insert: {
                    "claimed_at"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"external_message_id"?: string | null,"failed_at"?: string | null,"id"?: never,"payload"?: Json | null,"provider": Database["public"]['Enums']["notification_provider"],"retry_count"?: number,"scheduled_at"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"task_id"?: string | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Update: {
                    "claimed_at"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"external_message_id"?: string | null,"failed_at"?: string | null,"id"?: never,"payload"?: Json | null,"provider"?: Database["public"]['Enums']["notification_provider"],"retry_count"?: number,"scheduled_at"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"task_id"?: string | null,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string
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
                    "created_at": string,"daily_summary_enabled": boolean,"deadline_reminder_enabled": boolean,"end_of_day_summary_enabled": boolean,"overdue_alert_enabled": boolean,"remind_before_minutes": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"daily_summary_enabled"?: boolean,"deadline_reminder_enabled"?: boolean,"end_of_day_summary_enabled"?: boolean,"overdue_alert_enabled"?: boolean,"remind_before_minutes"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"daily_summary_enabled"?: boolean,"deadline_reminder_enabled"?: boolean,"end_of_day_summary_enabled"?: boolean,"overdue_alert_enabled"?: boolean,"remind_before_minutes"?: number,"updated_at"?: string,"user_id"?: string
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
"claim_notifications":
{ Args: { "p_limit"?: number,"p_provider": Database["public"]['Enums']["notification_provider"] }; Returns: {
              "claimed_at": string | null,
"created_at": string,
"dedupe_key": string | null,
"error": string | null,
"external_message_id": string | null,
"failed_at": string | null,
"id": number,
"payload": Json | null,
"provider": Database["public"]['Enums']["notification_provider"],
"retry_count": number,
"scheduled_at": string,
"sent_at": string | null,
"status": Database["public"]['Enums']["notification_status"],
"task_id": string | null,
"type": Database["public"]['Enums']["notification_type"],
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "notification_logs"
        isOneToOne: false
        isSetofReturn: true
      } },
"complete_notification":
{ Args: { "p_external_message_id"?: string,"p_id": number }; Returns: boolean
                           },
"display_status":
{ Args: { "t": Database["public"]['Tables']["tasks"]['Row'] }; Returns: Database["public"]['Enums']["task_display_status"]
                           },
"ensure_today_fixed_tasks":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"fail_notification":
{ Args: { "p_error": string,"p_final"?: boolean,"p_id": number }; Returns: Database["public"]['Enums']["notification_status"]
                           },
"reorder_fixed_task_templates":
{ Args: { "p_assignee_id": string,"p_ids": (string)[] }; Returns: undefined
                           },
"report_daily":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "adhoc_completed": number,"adhoc_created": number,"adhoc_overdue": number,"day": string,"fixed_completed": number,"fixed_expected": number,"fixed_missed": number
            }[]
                           },
"report_summary":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "adhoc_completed": number,"adhoc_created": number,"adhoc_on_time": number,"adhoc_outstanding": number,"adhoc_overdue": number,"assignee_id": string,"fixed_completed": number,"fixed_expected": number,"fixed_missed": number
            }[]
                           },
"tasks_in_range":
{ Args: { "p_assignee_id": string,"p_from": string,"p_to": string }; Returns: {
              "allow_employee_note": boolean,
"assignee_id": string,
"completed": boolean,
"completed_at": string | null,
"completed_by": string | null,
"created_at": string,
"created_by": string | null,
"deadline_at": string | null,
"employee_note": string | null,
"fixed_template_id": string | null,
"id": string,
"note": string | null,
"sort_order": number,
"task_date": string | null,
"title": string,
"type": Database["public"]['Enums']["task_type"],
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "tasks"
        isOneToOne: false
        isSetofReturn: true
      } },
"team_overview":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "adhoc_done": number,"adhoc_total": number,"assignee_id": string,"fixed_done": number,"fixed_total": number,"overdue": number
            }[]
                           },
"zalo_clear_tokens":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"zalo_configure_dispatch":
{ Args: { "p_secret": string,"p_url": string }; Returns: undefined
                           },
"zalo_create_link_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"zalo_get_tokens":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"zalo_link_by_code":
{ Args: { "p_code": string,"p_zalo_user_id": string }; Returns: Json
                           },
"zalo_save_tokens":
{ Args: { "p_access_token": string,"p_expires_at": string,"p_refresh_token": string }; Returns: undefined
                           },
"zalo_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"zalo_unlink":
{ Args: { "p_user_id"?: string }; Returns: boolean
                           }
          }
          Enums: {
            "app_role": "ADMIN"|"EMPLOYEE","notification_provider": "ZALO"|"IN_APP","notification_status": "PENDING"|"PROCESSING"|"SENT"|"FAILED","notification_type": "MORNING_SUMMARY"|"DEADLINE_REMINDER"|"OVERDUE_REMINDER"|"END_OF_DAY_SUMMARY"|"ADMIN_DAILY_SUMMARY"|"NEW_TASK"|"DEADLINE_CHANGED"|"TEST","task_action": "CREATED"|"UPDATED"|"RESCHEDULED"|"COMPLETED"|"REOPENED","task_display_status": "UPCOMING"|"TODAY"|"OVERDUE"|"COMPLETED","task_type": "FIXED"|"ADHOC"
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
            "app_role": ["ADMIN", "EMPLOYEE"],"notification_provider": ["ZALO", "IN_APP"],"notification_status": ["PENDING", "PROCESSING", "SENT", "FAILED"],"notification_type": ["MORNING_SUMMARY", "DEADLINE_REMINDER", "OVERDUE_REMINDER", "END_OF_DAY_SUMMARY", "ADMIN_DAILY_SUMMARY", "NEW_TASK", "DEADLINE_CHANGED", "TEST"],"task_action": ["CREATED", "UPDATED", "RESCHEDULED", "COMPLETED", "REOPENED"],"task_display_status": ["UPCOMING", "TODAY", "OVERDUE", "COMPLETED"],"task_type": ["FIXED", "ADHOC"]
          }
        }
} as const
