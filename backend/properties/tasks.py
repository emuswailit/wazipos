from celery import Celery
from .models import PropertyUnitPayments,PropertyUnitPaymentMonths
from intergrations.jambopay.jambopay_check_payment_status import jambopay_check_payment_status
from datetime import date
from dateutil.relativedelta import relativedelta


app = Celery()



@app.task
def check_jambopay_rent_payment_status():
    reference_number=""
    if PropertyUnitPayments.objects.filter(status="PENDING").exists():
        pending_payments = PropertyUnitPayments.objects.filter(status="PENDING").all()
        for payment in pending_payments:
            print("Checking rent payment  status.....",payment.reference_number)
            errors, result_json= jambopay_check_payment_status(payment.psp_reference_number)
            if result_json:
                print("Rent payment status.....(MOBILE MONEY)",result_json)
                if result_json and result_json["status"]=="SUCCESS":
                    payment.status="SUCCESS"
                    payment.provider_reference_number=result_json['providerRef']
                    payment.psp_reference_number=result_json['ref']
                    payment.description=result_json['description']

                    # Set valid_from and valid_to dates based on months paid

                    today = date.today()
                    future_date = today + relativedelta(months=payment.months)
                    payment.valid_from = today
                    payment.valid_to = future_date
                    payment.save()

                    # Create records for each month paid for
                    if PropertyUnitPaymentMonths.objects.filter(payment__property_unit=payment.property_unit).exists():
                        last_paid_month = PropertyUnitPaymentMonths.objects.filter(payment__property_unit=payment.property_unit).last()

                        for i in range(payment.months):
                            month_paid_for = last_paid_month + relativedelta(months=i+1)
                            PropertyUnitPaymentMonths.objects.create(payment=payment, month=month_paid_for)
                    else:   
                        month_paid_for = today.month 
                        PropertyUnitPaymentMonths.objects.create(payment=payment, month=month_paid_for)
            

                if result_json and result_json["status"]=="FAILED":
                    payment.status="FAILED"
                    payment.psp_reference_number=result_json['ref']
                    payment.description=result_json['description']
                    payment.save()  
                
                    return 

    else:
        print("No pending rent payments")