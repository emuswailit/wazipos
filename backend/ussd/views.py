from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse
from django.contrib.auth import get_user_model
from .ussd_utils import ussd_utils,bus_tickets_ussd_utils,transfers_ussd_utils,rent_ussd_utils, boda_fare_utils, matatu_fare_utils, parking_ussd_utils,wallet_utils
import logging
# Create your views here.
from . import models
import datetime

logger = logging.getLogger('ussd dials')

User = get_user_model()
@csrf_exempt
def index(request):

    user = None
    vehicle_reg= None
    splitted = None
    response = None
    last_dial = None
    new_dial = None
    all_input = None
    last_input =None
    level =""
    if request.method == 'GET':
        sessionid = request.GET.get('sessionid')
        print("sesionId",sessionid)
       
        msisdn = request.GET.get('msisdn',"")
        inputs = request.GET.get('inputs')
        splitted = []
        print("msisdn", msisdn)
        if msisdn:
            response = ussd_utils.generate_step_1_response_1(msisdn)

            created_time = datetime.datetime.now() - datetime.timedelta(minutes=2)
            if models.Dials.objects.filter(msisdn=msisdn, created__lte=created_time).order_by('session').exists():
                
                last_dial =models.Dials.objects.filter(msisdn=msisdn,created__lte=created_time).order_by('session').exists()
                
                print("Last dial", last_dial)
                if  inputs:
                    splitted_input =inputs.split('*') 
                    last_input =  splitted_input[-1] 
                    
                    new_dial = models.Dials.objects.create(session=sessionid,msisdn=msisdn,all_input=inputs,last_input=last_input)
                
            else:
                print("No prev dial")
                new_dial = models.Dials.objects.create(session=sessionid,msisdn=msisdn,all_input=inputs,level=level)
            
            # inputs = new_dial.level
            
 
            # if inputs:
            if inputs=="0" and len(inputs)==1 or inputs=="98" and len(inputs)==2:  
                splitted = inputs.replace("*98","").replace("*0*","").split('*') 

            else:
                splitted=inputs.split("*") 
            # response = f"CON inputs: {inputs} \n"
            # response += f"slplitted: {splitted}"
            # print("SPLITTED replaced",splitted)
            if splitted[0]=="1":
                if len(splitted)==1 and not splitted[-1]==None:
                    response = matatu_fare_utils.pay_matatu_fare2_1(splitted, msisdn)
                if len(splitted)==2 and not splitted[-1]==None:
                    response = matatu_fare_utils.pay_matatu_fare2_2(splitted, msisdn)
                if len(splitted)==3 and not splitted[-1]==None:
                    response = matatu_fare_utils.pay_matatu_fare2_3(splitted, msisdn)
                if len(splitted)==4 and not splitted[-1]==None:
                    response = matatu_fare_utils.pay_matatu_fare2_4(splitted, msisdn)
            # if splitted[0]=="1":
            #     if len(splitted)==1 and not splitted[-1]==None:
            #         response = ussd_utils.handle_pay_fare(splitted)
            #     if len(splitted)==2 and not splitted[-1]==None:
            #         response = ussd_utils.handle_vehicle_registration_input(splitted[-1])
            #     if len(splitted)==3 and not splitted[-1]==None:
            #         response = ussd_utils.handle_number_of_tickets(splitted)
            #     if len(splitted)==4 and not splitted[-1]==None:
            #         response = ussd_utils.handle_select_payment_method(splitted,msisdn)
            #     if len(splitted)==5 and not splitted[-1]==None:
            #         response = ussd_utils.handle_optional_amount(splitted, msisdn)
            #     if len(splitted)==6 and not splitted[-1]==None:
            #         response = ussd_utils.handle_finalize_ticket(splitted, msisdn)
            
            
            elif splitted[0]=="2":
                if len(splitted)==1 and not splitted[-1]==None:
                    response = bus_tickets_ussd_utils.bus_tickets_step_1(splitted, msisdn)
                if len(splitted)==2 and not splitted[-1]==None:
                    response = bus_tickets_ussd_utils.bus_tickets_step_2(splitted, msisdn)
                if len(splitted)==3 and not splitted[-1]==None:
                    response = bus_tickets_ussd_utils.bus_tickets_step_3(splitted, msisdn)
                if len(splitted)==4 and not splitted[-1]==None:
                    response = bus_tickets_ussd_utils.bus_tickets_step_4(splitted, msisdn)
                if len(splitted)==5 and not splitted[-1]==None:
                    response = bus_tickets_ussd_utils.bus_tickets_step_5(splitted, msisdn)
                if len(splitted)==6 and not splitted[-1]==None:
                    response = bus_tickets_ussd_utils.bus_tickets_step_6(splitted, msisdn)
                if len(splitted)==7 and not splitted[-1]==None:
                    response = bus_tickets_ussd_utils.bus_tickets_step_7(splitted, msisdn)
                if len(splitted)==8 and not splitted[-1]==None:
                    response = bus_tickets_ussd_utils.bus_tickets_step_8(splitted, msisdn)

            elif splitted[0]=="3":
                if len(splitted)==1 and not splitted[-1]==None:
                    response = boda_fare_utils.pay_boda_fare_1(splitted, msisdn)
                if len(splitted)==2 and not splitted[-1]==None:
                    response = boda_fare_utils.pay_boda_fare_2(splitted, msisdn)
                if len(splitted)==3 and not splitted[-1]==None:
                    response = boda_fare_utils.pay_boda_fare_3(splitted, msisdn)
  
                # if len(splitted)==1 and not splitted[-1]==None:
                #     response = ussd_utils.handle_my_tickets(splitted,msisdn)
                # if len(splitted)==2 and not splitted[-1]==None:
                #     response = ussd_utils.handle_ticket_details(splitted,msisdn)
                # else:
                #     response = ussd_utils.handle_my_tickets(splitted,msisdn)
            # elif splitted[0]=="4":
            #     if len(splitted)==1 and not splitted[-1]==None:
            #         response = transfers_ussd_utils.transfers_1(splitted, msisdn)
            #     if len(splitted)==2 and not splitted[-1]==None:
            #         response = transfers_ussd_utils.transfers_2(splitted, msisdn)
            #     if len(splitted)==3 and not splitted[-1]==None:
            #         response = transfers_ussd_utils.transfers_3(splitted, msisdn)
            #     if len(splitted)==4 and not splitted[-1]==None:
            #         response = transfers_ussd_utils.transfers_4(splitted, msisdn)
            #     if len(splitted)==5 and not splitted[-1]==None:
            #         response = transfers_ussd_utils.transfers_5(splitted, msisdn)
            #     if len(splitted)==6 and not splitted[-1]==None:
            #         response = transfers_ussd_utils.transfers_6(splitted, msisdn)
            #     if len(splitted)==7 and not splitted[-1]==None:
            #         response = transfers_ussd_utils.transfers_7(splitted, msisdn)
            #     if len(splitted)==8 and not splitted[-1]==None:
            #         response = transfers_ussd_utils.transfers_8(splitted, msisdn)

            elif splitted[0]=="4":
                if len(splitted)==1 and not splitted[-1]==None:
                    response = rent_ussd_utils.rent_1(splitted, msisdn)
                if len(splitted)==2 and not splitted[-1]==None:
                    response = rent_ussd_utils.rent_2(splitted, msisdn)
                if len(splitted)==3 and not splitted[-1]==None:
                    response = rent_ussd_utils.rent_3(splitted, msisdn)
                if len(splitted)==4 and not splitted[-1]==None:
                    response = rent_ussd_utils.rent_4(splitted, msisdn)
                
            elif splitted[0]=="5":
                    if len(splitted)==1 and not splitted[-1]==None:
                        response = parking_ussd_utils.parking_1(splitted, msisdn)
                    if len(splitted)==2 and not splitted[-1]==None:
                        response = parking_ussd_utils.parking_2(splitted, msisdn)
                    if len(splitted)==3 and not splitted[-1]==None:
                        response = parking_ussd_utils.parking_3(splitted, msisdn)
            elif splitted[0]=="6":
                if len(splitted)==1 and not splitted[-1]==None:
                    response = ussd_utils.retrieve_wallet_details(msisdn)
                elif len(splitted)==2 and not splitted[-1]==None:
                    # 6*1 Payouts
                    if splitted[1]=="1" and not splitted[-1]==None:
                        response =  wallet_utils.wallet_payout_1(splitted, msisdn)
                    elif splitted[1]=="2" and not splitted[-1]==None:
                        # 6.*2 Manage pin
                        response =  wallet_utils.wallet_manage_pin_1(splitted, msisdn)
                        # 6*3 Subscriptions
                    elif splitted[1]=="3" and not splitted[-1]==None:
                        response =  wallet_utils.wallet_subscriptions_1(splitted, msisdn)
                    elif splitted[1]=="5" and not splitted[-1]==None:
                        response =  wallet_utils.wallet_opt_out_1(splitted, msisdn)
                    elif splitted[1]=="4" and not splitted[-1]==None:
                        response =  wallet_utils.wallet_payout_1(splitted, msisdn)
                elif len(splitted)==3 and not splitted[-1]==None:
                    #6*1*amount
                    if  splitted[1]=="1" and not splitted[-1]==None:
                        response=wallet_utils.wallet_payout_2(splitted, msisdn)
                        # Manage pin
                    if  splitted[1]=="2" and splitted[2]=="1" and not splitted[-1]==None:
                        response=wallet_utils.check_password_status_1(splitted, msisdn)
                    if  splitted[1]=="2" and splitted[2]=="2" and not splitted[-1]==None:
                        response=wallet_utils.set_password_1(splitted, msisdn)
                    if  splitted[1]=="2" and splitted[2]=="3" and not splitted[-1]==None:
                        response=wallet_utils.change_password_1(splitted, msisdn)
                        # Subscriptions
                    if  splitted[1]=="3" and splitted[2]=="1" and not splitted[-1]==None:
                        response=wallet_utils.all_subscriptions(splitted, msisdn)
                    if  splitted[1]=="3" and splitted[2]=="2" and not splitted[-1]==None:
                        response=wallet_utils.my_subscriptions(splitted, msisdn)
      
                elif len(splitted)==4 and not splitted[-1]==None:
                    #6*1*amount*pm
                    if splitted[1]=="1" and not splitted[-1]==None:
                        response=wallet_utils.wallet_payout_3(splitted, msisdn)
                    if splitted[2]=="2" and not splitted[-1]==None:
                        response=wallet_utils.set_password_2(splitted, msisdn)
                    if splitted[2]=="3" and not splitted[-1]==None:
                        response=wallet_utils.change_password_2(splitted, msisdn)
                        # Subscriptions : All
                    if  splitted[1]=="3" and splitted[2]=="1" and not splitted[-1]==None:
                        print("Hapa sasa")
                        response=wallet_utils.all_subscriptions_subscription_options(splitted, msisdn)

                    # if  splitted[1]=="3" and splitted[3]=="1" and not splitted[-1]==None:
                    #     response=wallet_utils.my_subscriptions_pay_pending_installments_1(splitted, msisdn)
                    
                    if  splitted[1]=="3" and splitted[2]=="2" and not splitted[-1]==None:
                        response=wallet_utils.my_subscriptions_2(splitted, msisdn)

                    # Subscriptions : My
                
                elif len(splitted)==5 and not splitted[-1]==None:
                    if splitted[1]=="1" and not splitted[-1]==None:
                        response=wallet_utils.wallet_payout_4(splitted, msisdn)
                    if splitted[2]=="2" and not splitted[-1]==None:
                        response=wallet_utils.set_password_3(splitted, msisdn)
                    if splitted[2]=="3" and not splitted[-1]==None:
                        response=wallet_utils.change_password_3(splitted, msisdn)



           


                    # All subscriptions
                    # Options
                    if  splitted[1]=="3" and splitted[2]=="1" and splitted[4]=="1" and not splitted[-1]==None:
                        response=wallet_utils.all_subscriptions_join_pin(splitted, msisdn)

                        #My Subscriptions*Susbcription Status
                    if  splitted[1]=="3" and splitted[2]=="2" and splitted[4]=="1"  and not splitted[-1]==None:
                        response=wallet_utils.my_subscriptions_installments_status(splitted, msisdn)

                        #My Subscriptions * Pay Pending Installments 1
                    if  splitted[1]=="3"  and splitted[2]=="2" and splitted[4]=="2"  and not splitted[-1]==None:
                        response=wallet_utils.my_subscriptions_pay_pending_installments_1(splitted, msisdn)
                        #My Subscriptions * Pay All Installments 1
                    if  splitted[1]=="3" and splitted[2]=="2" and splitted[4]=="3"  and not splitted[-1]==None:
                        response=wallet_utils.my_subscriptions_pay_all_installments_1(splitted, msisdn)

                                        #My Subscriptions * Pay out
                    if  splitted[1]=="3" and splitted[4]=="4"  and not splitted[-1]==None:
                        response=wallet_utils.my_subscription_pay_out_1(splitted, msisdn)

                        #My Subscriptions * Quit
                    if  splitted[1]=="3" and splitted[4]=="5"  and not splitted[-1]==None:
                        response=wallet_utils.my_subscription_opt_out_1(splitted, msisdn)

                elif len(splitted)==6 and not splitted[-1]==None:
                    if splitted[1]=="1" and not splitted[-1]==None:
                        response=wallet_utils.wallet_payout_5(splitted, msisdn)
                    # All subscriptions
                    # Join
                    if splitted[2]=="3" and not splitted[-1]==None:
                        response=wallet_utils.change_password_4(splitted, msisdn)
                    
                    if  splitted[1]=="3" and splitted[2]=="1" and splitted[4]=="1" and not splitted[-1]==None:
                        response=wallet_utils.all_subscriptions_join(splitted, msisdn)


                    #My Subscriptions * Pay Pending Installments 1
                    if  splitted[1]=="3" and splitted[4]=="2"  and not splitted[-1]==None:
                        response=wallet_utils.my_subscriptions_pay_pending_installments_2(splitted, msisdn)

                    #My subscriptions*Pay All Installments 2
                    if  splitted[1]=="3" and splitted[4]=="3"   and not splitted[-1]==None:
                        response=wallet_utils.my_subscriptions_pay_all_installments_2(splitted, msisdn)

                                                        #My Subscriptions * Pay out
                    if  splitted[1]=="3" and splitted[4]=="4"  and not splitted[-1]==None:
                        response=wallet_utils.my_subscription_pay_out_2(splitted, msisdn)


                    #My subscriptions* Ot out 2
                    if  splitted[1]=="3" and splitted[4]=="5"  and not splitted[-1]==None:
                        response=wallet_utils.my_subscription_opt_out_2(splitted, msisdn)

                elif len(splitted)==7 and not splitted[-1]==None:
                    print("spritted",splitted)
                    if splitted[1]=="1" and not splitted[-1]==None:
                        response=wallet_utils.wallet_payout_6(splitted, msisdn)
                    if  splitted[1]=="3" and splitted[2]=="1" and splitted[4]=="1" and not splitted[-1]==None:
                        response=wallet_utils.all_subscriptions_join(splitted, msisdn)

                                                        #My Subscriptions * Pay out paybill
                    if  splitted[1]=="3" and splitted[4]=="4"  and not splitted[-1]==None:
                        response=wallet_utils.my_subscription_pay_out_paybill(splitted, msisdn)
            elif splitted[0]=="7":
                
                if len(splitted)==1 and not splitted[-1]==None:
                    
                    response = ussd_utils.retrieve_user_vehicles_list(msisdn)
                elif len(splitted)==2 and not splitted[-1]==None:
                    print("AM HERE")
                    response = ussd_utils.handle_vehicle_options(splitted,msisdn)
                elif len(splitted)==3 and not splitted[-1]==None:
                    
                    if splitted[-1]=="1":
                        response = ussd_utils.handle_get_today_collection(splitted,msisdn)
                    elif splitted[-1]=="2":
                        response = ussd_utils.handle_get_collector_wallet_balance(splitted,msisdn)
                    elif splitted[-1]=="3":
                      
                        response = ussd_utils.handle_vehicle_trips(splitted, msisdn)
                    elif splitted[-1]=="4":
                        """List subscriptions for vehicle"""
                        response = ussd_utils.handle_list_vehicle_subscriptions(splitted,msisdn)
                    elif splitted[-1]=="5":
                        """View crew menu options"""
                        response = ussd_utils.handle_show_vehicle_crew_options(splitted,msisdn)
                    elif splitted[-1]=="6":
                        """ 4*1*6: Request amount """
                        response = ussd_utils.handle_vehicle_collection_payouts_1(splitted,msisdn)
                    elif splitted[-1]=="7":
                        """ 4*1*7: Deactivate vehicle"""
                        response = ussd_utils.handle_manage_password(splitted,msisdn)
                    else:
                        response = ussd_utils.handle_vehicle_options(splitted,msisdn)
                elif len(splitted)==4 and not splitted[-1]==None:
                    if splitted[-1]=="1":
                        response = ussd_utils.handle_select_trip_route(splitted,msisdn)
                    if splitted[-1]=="2":
                        """End current trip"""
                        response = ussd_utils.handle_end_current_trip(splitted,msisdn)
                    if splitted[-1]=="3":
                        """List last 5 trips"""
                        response = ussd_utils.handle_list_trips(splitted,msisdn)
                    if splitted[2]=="4" and not splitted[-1]==None:
                        """List current subscription optios"""
                        response = ussd_utils.handle_list_subscription_options(splitted,msisdn)
                    if splitted[2]=="5" and not splitted[-1]==None:
                        """Crew options"""
                        if splitted[-1]=="1":
                            """List crew"""
                            response = ussd_utils.handle_list_vehicle_crew(splitted,msisdn)
                        if splitted[-1]=="2":
                            
                            response = ussd_utils.handle_add_vehicle_crew(splitted,msisdn)
                    if splitted[2]=="6" and not splitted[-1]==None: 
                        """4*1*6*n: Process payout for channel n """
                        response = ussd_utils.handle_vehicle_collection_payouts_2(splitted, msisdn) 
                    if splitted[2]=="7" and not splitted[-1]==None: 
                        """4*1*1*n: Process payout for channel n """
                        if splitted[-1]=="1":
                            """Password status"""
                            response = ussd_utils.check_wallet_has_set_password(splitted,msisdn)
                        if splitted[-1]=="2":
                            """Set password"""
                            response = ussd_utils.set_wallet_pin_step1(splitted,msisdn)

                elif len(splitted)==5 and not splitted[-1]==None:
                    print("sppp", splitted)
                    if  splitted[3]=="1" and splitted[-1]=="1":
                        """Create trip"""
                        response = ussd_utils.handle_start_trip(splitted,msisdn)
                    if splitted[3]=="3" and not splitted[-1]==None:
                        """ View trip options """
                        response = ussd_utils.display_trip_options(splitted,msisdn)
                    if splitted[2]=="4":
                        """ Selected subscription option"""
                        if splitted[-1]=="1":
                            response =  ussd_utils.check_subscription_status(splitted,msisdn)
                        if splitted[-1]=="2":
                            response = ussd_utils.pay_sacco_subscription(splitted,msisdn)
                    elif  splitted[2]=="5" and not splitted[-1]==None:
                        """Selected add crew option"""
                        if splitted[3]=="1":
                            """ 4*1*5*1*n: Show crew member details"""
                            response = ussd_utils.show_selected_crew_member_details(splitted, msisdn)
                           
                        if splitted[3]=="2":
                            """ 4*1*5*2: Show crow member details"""  
                            # response = "Act on received phone number"
                            response = ussd_utils.handle_get_sacco_personnel_to_add_crew(splitted, msisdn)
                    elif  splitted[2]=="6" and not splitted[-1]==None:
                        """ 4*1*6*amount*n : Select payout method"""
                        response = ussd_utils.handle_vehicle_collection_payouts_3(splitted, msisdn)
                    elif  splitted[2]=="7" and not splitted[-1]==None:
                        """ 4*1*7*n : Handle payout channel details input"""
                        response = ussd_utils.set_wallet_pin_step2(splitted, msisdn)
                
                elif len(splitted)==6 and not splitted[-1]==None:
                    """ Get selected trip collection"""
                    if splitted[2]=="3":
                        """Trips 6th step"""
                        if splitted[-1]=="1":
                            """ Check collected amount from a trip """
                            response = ussd_utils.get_trip_collection(splitted,msisdn)
                        if splitted[-1]=="2":
                            """ Close trip from trips listing """
                            response = ussd_utils.handle_close_trip_from_trip_list(splitted,msisdn)
                    elif splitted[2]=="4":
                        """ Subscriptions 6th step """
                        if not splitted[-1]==None:
                            response = ussd_utils.finalize_subscription_payment(splitted, msisdn)
                    elif splitted[2]=="5" and not splitted[-1]==None:
                        response = ussd_utils.handle_select_crew_type(splitted, msisdn)
                    
                    elif splitted[2]=="6" and not splitted[-1]==None:
                        """ 4*1*6*1000*channel*channel_detail1 """
                        response = ussd_utils.handle_vehicle_collection_payouts_4(splitted, msisdn)
                        # response = ussd_utils.handle_payout_to_airtel_or_mpesa_numbers(splitted, msisdn)
                elif len(splitted)==7:
                    """ 4*1*6*100*4*paybill*accountnumber*pin """
                    if splitted[2]=="6" and not splitted[-1]==None:
                        response = ussd_utils.handle_vehicle_collection_payouts_5(splitted, msisdn)
                elif len(splitted)==8:
                    if splitted[2]=="6" and not splitted[-1]==None:
                        response = ussd_utils.handle_vehicle_collection_payouts_6(splitted, msisdn)
            elif splitted[0]=="8":
                response = ussd_utils.handle_retrieve_conductor_vehicle_and_trip_details(splitted, msisdn)
                if len(splitted)==2 and not splitted[-1]==None:
                    response = ussd_utils.request_number_of_seats_to_pay(splitted, msisdn)
                elif len(splitted)==3 and not splitted[-1]==None:
                    response = ussd_utils.handle_select_payment_method_conductor(splitted, msisdn)
                elif len(splitted)==4 and not splitted[-1]==None:
                    response = ussd_utils.handle_enter_mobile_money_phone_number(splitted, msisdn)
                elif len(splitted)==5 and not splitted[-1]==None:
                    response = ussd_utils.handle_finalize_conductor_ticket(splitted, msisdn)
        else:
            response = "msisdn error"


    return HttpResponse(response)