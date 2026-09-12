export interface CustomerOrder {
    id: string;
    order_number: string;
    draft_id: string;
    status: string;
    order_price_total: string;
    is_paid: "true" | "false";
    paid_at: string | null;
    delivery_method: string;
    customer_name: string;
    customer_phone: string;
    email: string;
    entity_title: string;
    created: string;
    updated?: string;
    selected_payment_method: string;
    selected_payment_method_title: string;
    provider_reference_number: string | null;
    order_items: any[];
    synced?: "TRUE" | "FALSE";
    last_mutated_at?: number;
}
