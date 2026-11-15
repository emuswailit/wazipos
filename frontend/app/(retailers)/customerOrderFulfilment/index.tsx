// app/(retailers)/customerOrderFulfilment/index.tsx

import FulfilmentQueue from '@/components/fulfilment/FulfilmentQueue';

export default function CustomerOrderFulfilmentRoute() {
    return <FulfilmentQueue kind="customer" />;
}
