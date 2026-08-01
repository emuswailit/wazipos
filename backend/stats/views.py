from django.shortcuts import render
from rest_framework.views import APIView
from datetime import datetime, timedelta,date
from retailers.models  import CustomerOrderItems,CustomerOrders
from rest_framework.pagination import PageNumberPagination
from retailers.serializers import RetailerReceiptsSerializer
from rest_framework import response, status
from django.http import JsonResponse

# Create your views here.
class SoldRetailerInventorySummary(APIView):

    def get_quantity_for_title(self, order_items, product):
        items = order_items.filter(product=product)
        quantity =0

        for item in items:
            quantity+=item.purchased_quantity
            print("qTY",quantity)
            
        return {'quantity':str(quantity)}   


    
    def get_title(self,item):
        title =item.retailer_receipt.product.title
        print("title",title)
        return item.retailer_receipt.product.title
    
    def get_products(self,item):
        product =item.retailer_receipt.product
        print("product",product)
        return item.retailer_receipt.product

    def get(self,request):
        today_date = date.today()
        amonth_ago=today_date-timedelta(days=30)
        order_items=CustomerOrderItems.objects.all()[:10]
        final ={}
        titles = list(set(map(self.get_title,order_items)))
        products = list(set(map(self.get_products,order_items)))

        for order_item in order_items:
            for product in products:
                final[product.title] = self.get_quantity_for_title(order_items, product)
        return JsonResponse({"sold_inventory": final},status.HTTP_200_OK)


class RetailerSalesWeeklySummary(APIView):



    def get(self,request):
        final={}
        weekly_orders =[]
        days=[]
        now = datetime.now()

        for x in range(7):
            items_value=0.00
            orders=[]
            d = now - timedelta(days=x)
            days.append(d)
            next_day = d + timedelta(days=1)
            items = CustomerOrderItems.objects.filter(created__gte=d,created__lt=next_day,customer_order__is_paid="true",entity=request.user.entity)
            orders = CustomerOrders.objects.filter(entity=request.user.entity,created__gte=d,created__lt=next_day,is_paid="true").all()
            for item in items:
                items_value=items_value+ float(item.item_price_total)
                print(item.created)
            weekly_orders.append({"date":d.strftime("%Y-%m-%d"),"items":len(items),"value":items_value,"orders":len(orders)})
        final["weekly_orders"]=weekly_orders

    
        return JsonResponse({"data": final},status=200)          