export interface OrderItemDetail {
    id: string;
    title: string;
    purchased_quantity: number;
    item_price: string;
    item_net_price_total: string;
}

export interface OrderRecord {
    id: string;
    order_number: string;
    created: string;
    customer_name: string;
    customer_phone: string;
    selected_payment_method_title: string;
    delivery_method: 'PICKUP' | 'DELIVERY';
    order_net_price_total: string;
    shipping_cost: string;
    status: 'PROCESSING' | 'SUCCESS' | 'COMPLETED' | 'PENDING' | 'FAILED';
    order_items: OrderItemDetail[];
}
