export interface OutOfStockItem {
    id: string;
    product: {
        id: string;
        product_name: string;
        bar_code: string;
    };
    required_quantity: number;
    customer_name: string | null;
    customer_phone: string | null;
    unit_of_receipt: string;
    is_special_order: string;
    is_ordered: string;
    created: string;
}

export interface AutocompleteProductOption {
    id: string;
    product_name: string;
    bar_code: string;
}

export interface OutOfStockFormValues {
    product: AutocompleteProductOption | null;
    required_quantity: string;
    customer_name: string;
    customer_phone: string;
}
