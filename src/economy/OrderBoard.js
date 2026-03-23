export class OrderBoard {
    constructor() {
        this.orders = [];
        this.orderIdCounter = 1;
    }

    createOrder(consumerStation, commodityId, amount, priceOffered, simTime) {
        // Prevent duplicate open orders for the exact same commodity from the same station
        const existing = this.orders.find(o => o.consumer === consumerStation && o.commodityId === commodityId && o.status === 'OPEN');
        if (existing) {
            // Update existing order if it's open
            existing.amount = amount;
            existing.priceOffered = priceOffered;
            return existing;
        }

        const order = {
            id: 'ORD-' + this.orderIdCounter++,
            consumer: consumerStation,
            commodityId: commodityId,
            amount: amount,
            priceOffered: priceOffered,
            status: 'OPEN',
            producer: null, // assigned when accepted
            createdSimTime: simTime
        };
        this.orders.push(order);
        return order;
    }

    getOpenOrders() {
        return this.orders.filter(o => o.status === 'OPEN');
    }

    acceptOrder(orderId, producer) {
        const order = this.orders.find(o => o.id === orderId);
        if (order && order.status === 'OPEN') {
            order.status = 'ACCEPTED';
            order.producer = producer; 
            order.producerName = typeof producer === 'string' ? producer : producer.name;
            return true;
        }
        return false;
    }

    fulfillOrder(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (order && order.status === 'ACCEPTED') {
            order.status = 'FULFILLED';
            return true;
        }
        return false;
    }

    // Cleanup fulfilled or expired orders
    cleanup() {
        this.orders = this.orders.filter(o => o.status !== 'FULFILLED');
    }
}
