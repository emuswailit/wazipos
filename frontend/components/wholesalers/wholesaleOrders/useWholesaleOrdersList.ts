import wholesalersApi from '@/api/wholesalersApi';
import { useApi } from '@/hooks/useApi';
import { useEffect, useState } from 'react';

export function useWholesaleOrdersList() {
    const [orders, setOrders] = useState<any[]>([]);
    const getOrdersApi = useApi(wholesalersApi.wholesaleRetailerOrdersAction);

    const getOrders = async () => {
        await getOrdersApi.request({
            action: "GetRetailerOrdersForWholesaler"
        });
    };

    useEffect(() => {
        console.log("getOrdersApi.data", getOrdersApi.data);
        if (getOrdersApi.data && getOrdersApi.data.length) {
            setOrders(getOrdersApi.data);
        }
    }, [getOrdersApi.data]);

    useEffect(() => {
        getOrders();
    }, []);

    return {
        ordersList: orders,
        isLoading: getOrdersApi.loading,
        errorMessage: getOrdersApi.errorMessage,
        refreshOrdersList: getOrders
    };
}
