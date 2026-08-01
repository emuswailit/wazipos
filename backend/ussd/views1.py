from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse
from django.contrib.auth import get_user_model
from .ussd_utils.ussd_utils import get_today_ticket_payment_settlements


from transport.models import Vehicles,  SaccoPersonnel, SaccoPersonnelAccount
from payments.models import PaymentMethods
from intergrations.jambopay.jambopay_wallet import get_user_jambopay_wallet_by_phone, get_wallet_balance
import datetime
import time


from ussd.ussd_utils.ussd_utils import get_trip_by_vehicle_registration,create_tickets

# Create your views here.

User = get_user_model()
@csrf_exempt
def index(request):
    user = None
    vehicle_reg= None
    if request.method == 'POST':
        session_id = request.POST.get('sessionId')
        service_code = request.POST.get('serviceCode')
        phone_number = request.POST.get('phoneNumber')
        all_destinations=[]
        selected_destination_number = None
        jambopay_wallet = None
        selected_destination_title=""
        selected_destination_fare=""
        number_of_tickets = 1
        number_of_tickets2 = 1
        fare_per_ticket = None
        vehicle_administrator = None
        sacco_personnel = None
        is_vehicle_crew = True
        crewed_vehicles =[]
        timestamp_integer = None
        crew_obj = None
        splitted=None
        vehicle_administrator_options = ""
        vehicle_crew_options = ""
        user_vehicles = []
        stripped_payment_methods = []
        payment_methods = PaymentMethods.objects.all().exclude(title="CASH")
        jambopay_wallet_balance =""
        jambopay_wallet = get_user_jambopay_wallet_by_phone(phone_number)

        if not jambopay_wallet==None:
            jambopay_wallet_balance = jambopay_wallet['currentBalance']
       
        print("JP WALLET", jambopay_wallet)

        print("My PMS", payment_methods)
        timestamp_integer = datetime.datetime.now()
        print("raw", timestamp_integer)
        # print("int", int(timestamp_integer))
        print("unix", print(time.mktime(timestamp_integer.timetuple()) * 1000))
        fareVoucherResponse = f"CON Fare Vouchers\n"
        fareVoucherResponse += "1. Buy Voucher \n"
        fareVoucherResponse += "2. Voucher Validity \n"


        payFareEnterVehicleRegistrationOption = "CON Enter vehicle registration number \n"
        paymentMethodOptionsHeader = "CON Select payment method \n"


        selectOriginDestinationOptions = "Select origin/destination \n"
        # selectUsrVehicleOptions = "CON Select your vehicle \n"

        if not phone_number==None:
           
            if User.objects.filter(phone=phone_number).exists():
                user = User.objects.filter(phone=phone_number).first()
                print("User", user)
        print("phone_number",phone_number)
        text = request.POST.get('text')
        print("Current text", text)
        splitted = text.split('*')
        print("Splitted text", splitted)

        response = ""
        if user:


            # Check if user is adminisrator for vehicles
            if SaccoPersonnel.objects.filter(user= user).exists():
                sacco_personnel = SaccoPersonnel.objects.filter(user= user).first()
                print("Is sacco personnel", sacco_personnel)

            if Vehicles.objects.filter(administrator = sacco_personnel).exists():
                user_vehicles = Vehicles.objects.filter(administrator=sacco_personnel).all()
                # print("Has Vehicles admined", user_vehicles)
                is_vehicle_administrator = True
                vehicle_crew_options  += "4. My Vehicles \n"
            else:
                vehicle_administrator_options=""
                        # Check if user is crew in vehicle
            # if CrewMember.objects.filter(user = user).exists():
            #     crew_obj = CrewMember.objects.filter(user = user).first()
            #     is_vehicle_crew = True
            #     vehicles = Vehicles.objects.all()
            #     # Get vehicles user is crew in
            #     for vehicle in vehicles:
            #         if len(vehicle.crew_members.all())>0:
            #             for crew in vehicle.crew_members:
            #                 if crew == crew_obj:
            #                     crewed_vehicles.append(vehicle)

            #     # vehicle_crew_options  += "5. My Trips \n"
            #     vehicle_crew_options  += "7. My Collection \n"

             
            # else:
            #     vehicle_crew_options=""


            # Split text if available
            if text == "" or splitted[-1] == "0":
                text = ""
                response = f"CON Welcome to Wazipos, {user.first_name} \n"
                response += "1. Pay Fare \n"
                response += "2. My Tickets  \n"
                response += "3. My Wallet   \n"
                response += vehicle_crew_options
            else:
                splitted = text.split('*')
        else:
            if text == "":
                response = "CON Welcome to Wazipos \n"
                response += "1. Pay Fare \n"
                response += "2. My Tickets \n"
                response += "3. Create Wallet \n"
            else:
                splitted = text.split('*')    
            
            

        print("Splitted top", splitted)
        # 1. Pay Fare Option : Known user
        if splitted[0]=="1":
            if len(splitted)==1:
                response += payFareEnterVehicleRegistrationOption
                
            if len(splitted)==2 and  len(splitted[-1])==7:
                vehicle_reg = splitted[1]
                print("the last",splitted[-1])
                
                errors, trip, destinations = get_trip_by_vehicle_registration(vehicle_reg)
                if errors and len(errors)>0:
                    for error in errors:
                        response += error
                    response +="Enter vehicle registration\n"

                    
                # if not trip:
                #     # No trip, request for another registration number
                #     print("trip",trip)
                #     print("destinations",destinations)
                #     print("errors at rip",errors)
                #     response = f"CON {errors[0]}. Enter vehicle registration\n"
            
                
                else:
                    # Display destinations
                    response = selectOriginDestinationOptions

                    for index, val in enumerate(destinations):
                        all_destinations.append(val)
                        response +=f"{str(index+1)}. {val.destination_from}-{val.destination_to} ({val.fare})\n"
            # Request number of seats to pay for
            if len(splitted)==3 and  not splitted[-1]==None:
                response = f"CON Enter number of tickets to pay\n"

            if len(splitted)==4 and  not splitted[-1]==None:
                response = paymentMethodOptionsHeader
                pm_string=""
                for index, val in enumerate(payment_methods):
                    stripped_payment_methods.append(val)
                    if val.title == "JAMBOPAY WALLET":
                        if not jambopay_wallet==None:
                            pm_string = f"{str(index+1)}. {val.title} Balance: {jambopay_wallet_balance}\n"
                            response += pm_string
                    else:
                        stripped_payment_methods.append(val)
                        pm_string = f"{str(index+1)}. {val.title}\n"
                        
                        response += pm_string
                
            if len(splitted)==5  and not splitted[-1]==None:
                selected_destination_number = splitted[3]
                number_of_tickets = float(splitted[3])
                number_of_tickets2 = int(splitted[3])
                errors, trip, destinations = get_trip_by_vehicle_registration(splitted[1])
                selected_destination_index=int(splitted[2])-1
                print("selected index", selected_destination_index)
                print("all dest", destinations)
                # selected_destination_title= destinations[selected_destination_index]['title']
                selected_destination_title= destinations[selected_destination_index].title
                selected_destination_fare= destinations[selected_destination_index].fare

        
                print("selected D", destinations[0])
                total_to_pay = number_of_tickets * float(selected_destination_fare)
                response = f"Enter 1 to pay KES {'{:.2f}'.format(total_to_pay)} for {selected_destination_title} or enter other amount"
            else:
                print("Niko hapa 1")
                pass
                # response = f"CON Enter number of tickets to pay\n"
        
            if len(splitted)==6  and not splitted[-1]==None:
                selected_payment_method_index = None
                number_of_tickets = float(splitted[3])
                number_of_tickets2 = float(splitted[3])
                errors, trip, destinations = get_trip_by_vehicle_registration(splitted[1])
                

                selected_destination_index=int(splitted[2])-1
                print("selected index", selected_destination_index)
                print("all dest", destinations)
                # selected_destination_title= destinations[selected_destination_index]['title']
                selected_destination_title= destinations[selected_destination_index].title
                selected_destination_fare= destinations[selected_destination_index].fare
                print("selected D", destinations[0])
                print("sp 5",splitted[4])
                selected_payment_method_index = int(splitted[4]) - 1
                print("SELECTED pm",selected_payment_method_index)
                payment_methods = PaymentMethods.objects.all().exclude(title="CASH")

                selected_payment_method_id = payment_methods[selected_payment_method_index].id


                total_to_pay = number_of_tickets * float(selected_destination_fare)
                if not splitted[5]=="1":
                    if int(splitted[5]) <1:
                        response = "CON Enter valid amount\n"
                        return HttpResponse(response)
                    else:
                        total_to_pay = float(splitted[5])
                        fare_per_ticket= total_to_pay/number_of_tickets
                        print("Fare per ticket", fare_per_ticket)

                        if float(fare_per_ticket) < float(float(0.9) * float(selected_destination_fare)):
                            response = "CON Amount is less than permitted discount of 10%\n"
                            return HttpResponse(response)
                        else:
                            create_tickets(total_to_pay,fare_per_ticket, number_of_tickets2,trip,selected_destination_index,destinations, splitted[5],phone_number, selected_payment_method_id)
                            response = "END thank you for using Wazipos \n"
                else:
                    
                    fare_per_ticket = selected_destination_fare
                    total_to_pay = number_of_tickets * float(selected_destination_fare)
                    create_tickets(total_to_pay,fare_per_ticket, number_of_tickets2,trip,selected_destination_index,destinations, splitted[4],phone_number,selected_payment_method_id)
                        
                    response = "END thank you for using Wazipos \n"

            
                    print("Okwai", response)
            elif splitted[0]=="2":
                # Fare Voucher options
                response = fareVoucherResponse
            
            
        elif  splitted[0]=="4":
            all_user_vehicles =[]
            if len(splitted)==1:
                if len(user_vehicles)>0:
                    response = f"CON Select your vehicle, {user.first_name} \n"
                    for index, val in enumerate(user_vehicles):
                        all_user_vehicles.append(val)
                        response +=f"{str(index+1)}. {val.registration}\n"
                else:
                    response += f"CON No administered vehicles \n" 
                    response += f"0. Main Menu \n" 
            
            
            if len(splitted)==2 and not splitted[-1]==None:
                if len(user_vehicles)>0:
                    response = f"CON Select your vehicle, {user.first_name} \n"
                    for index, val in enumerate(user_vehicles):
                        all_user_vehicles.append(val)
                        response +=f"{str(index+1)}. {val.registration}\n"
                    selected_vehicle_index = int(splitted[1])-1
                    print("Selected veh index ", selected_vehicle_index)
                    print("AllVehicles",all_user_vehicles)
                    reg =all_user_vehicles[selected_vehicle_index].registration
                    print("Reg",all_user_vehicles[selected_vehicle_index].registration)
                    vehicle = Vehicles.objects.filter(registration =reg).first()
                    print("Vehicle at select veh", vehicle)
                    if vehicle: 
                        response = f"CON {reg} \n"
                        response += "1. Today Collection \n"
                        response += "2. Wallet Balance \n"
                        response += "3. Trips \n"
                        response += "4. Subscriptions \n"
                        response += "5. Deactivate \n"
                    else:
                        response = f"CON {reg} not found\n" 
            # if len(splitted)==3 and not splitted[-1]==None:
                # selected_vehicle_index = int(splitted[1])-1
                # reg =all_user_vehicles[selected_vehicle_index].registration
            if len(splitted)==3 and not splitted[-1]==None:
                if splitted[-1]=="1":
                    if len(user_vehicles)>0:
                        print("User ve at step 4",user_vehicles)
                    
                        for index, val in enumerate(user_vehicles):
                            all_user_vehicles.append(val)
                            
                        selected_vehicle_index = int(splitted[1])-1
                        print("Selected veh index ", selected_vehicle_index)
                        print("AllVehicles",all_user_vehicles)
                        reg =all_user_vehicles[selected_vehicle_index].registration
                        print("Reg",all_user_vehicles[selected_vehicle_index].registration)
                        vehicle = Vehicles.objects.filter(registration =reg).first()
                    
                        if vehicle:
                            balance = 0.0000
                        
                            today_settlements = get_today_ticket_payment_settlements(user, vehicle)
                            if len(today_settlements)>0:
                                for stl in today_settlements:
                                    balance += float(stl.amount)
                                response = f"CON Totay balance : {reg} is KES {round(balance, 2)} \n"
                            else:
                                response = f"CON No collection today\n"

                        else:
                            response = f"CON  {reg} not found\n"

                elif splitted[2]=="2":
                    if len(user_vehicles)>0:
                        print("User ve at step 4",user_vehicles)
                    
                        for index, val in enumerate(user_vehicles):
                            all_user_vehicles.append(val)
                            
                        selected_vehicle_index = int(splitted[1])-1
                        print("Selected veh index ", selected_vehicle_index)
                        print("AllVehicles",all_user_vehicles)
                        reg =all_user_vehicles[selected_vehicle_index].registration
                        print("Reg",all_user_vehicles[selected_vehicle_index].registration)
                        vehicle = Vehicles.objects.filter(registration =reg).first()

                        if SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).exists():
                            wallet = SaccoPersonnelAccount.objects.filter(sacco_personnel=vehicle.administrator).first()
                            payload = {
                                "account_number": wallet.account_number
                            }
                            errors, balance_json = get_wallet_balance(payload)
                            if balance_json:
                                balance = balance_json["balance"]
                                response = f"CON {reg} : Attached wallet is  {wallet.account_number} {wallet.account_name}, balance is KES {balance} \n"
                            else:
                                response = f"CON Balance could not be retrieved"
      
                elif splitted[2]=="3":
                    if len(user_vehicles)>0:
                        print("User ve at step 4",user_vehicles)
                    
                        for index, val in enumerate(user_vehicles):
                            all_user_vehicles.append(val)
                            
                        selected_vehicle_index = int(splitted[1])-1
                        print("Selected veh index ", selected_vehicle_index)
                        print("AllVehicles",all_user_vehicles)
                        reg =all_user_vehicles[selected_vehicle_index].registration
                        print("Reg",all_user_vehicles[selected_vehicle_index].registration)
                        vehicle = Vehicles.objects.filter(registration =reg).first()
                        if vehicle: 
                            response = f"CON {reg} \n"
                            response += "1. Start Trip \n"
                            response += "2. End Current Trip \n"
                            response += "3. Trips \n"
             
                        else:
                            response = f"CON {reg} not found\n" 
            if len(splitted)==4 and not splitted[-1]==None:
                if splitted[3]=="1":
                    response = f"CON 1. Start Trip \n"
                    response += f"CON 0. Back \n"
                else:
                    if  splitted[-1]==0:
                        print("txt",text)
        
    return HttpResponse(response)

                
            


            # return HttpResponse(response)