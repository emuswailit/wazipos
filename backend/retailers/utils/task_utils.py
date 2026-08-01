
# from rest_framework import exceptions
# from django_celery_beat.models import IntervalSchedule, PeriodicTask


# @transaction.atomic
# def create_monitor_and_periodic_task(order_created):
#     print("Going to process mpesa")
#     print("Going to process mpesa amount", order_created.order_price_total)
#     payment_result = process_mpesa(
#         order_created.payment_account_number,
#         order_created.reference_number,
#         order_created.order_price_total,
#     )

#     if payment_result:
#         monitor = OrderMonitor.objects.create(customer_order=order_created, interval=2)

#         # if monitor:
#         #     print('Monitor created')
#         # else:
#         #     raise exceptions.ValidationError(
#         #         'Error creating monitor')
#         if monitor:
#             schedule, created = IntervalSchedule.objects.get_or_create(
#                 every=monitor.interval,
#                 period=IntervalSchedule.SECONDS,
#             )
#             task = PeriodicTask.objects.create(
#                 interval=schedule,
#                 name=f"Monitor: {order_created.reference_number}",
#                 task="retailers.tasks.task_customer_order_monitor",
#                 # kwargs=json.dumps(
#                 #     {
#                 #         "monitor_id": str(monitor.id),
#                 #         "reference_number": order_created.reference_number,
#                 #         "customer_order_id": str(order_created.id)
#                 #     }
#                 # ),
#             )

#             if task:
#                 print("Task  creared", task)
#                 monitor.task = task
#                 monitor.save()
#                 # Create payment for order
#                 payment = Payments.objects.create(
#                     reference_number=order_created.reference_number,
#                     amount=order_created.order_price_total,
#                     payment_method=order_created.selected_payment_method,
#                     narration="CUSTOMER_ORDER_PAYMENT",
#                     entity=order_created.entity,
#                     owner=order_created.owner,
#                 )

#                 order_created.is_paid = "true"
#                 items = CustomerOrderItems.objects.filter(
#                     customer_order=order_created
#                 ).all()
#                 update_stock(items)

#                 order_created.payment = payment
#                 order_created.save()

#                 return True

#             else:
#                 raise exceptions.ValidationError(
#                     "Retailer orders task utils: Task was not created"
#                 )
#         else:
#             raise exceptions.ValidationError(
#                 "Retailer orders task utils: Monitor was not created"
#             )

#     else:
#         raise exceptions.ValidationError(
#             "Retailer orders task utils: Mpesa payment failed"
#         )
