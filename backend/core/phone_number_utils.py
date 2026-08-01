
safaricom_prefixes =["110","111","112","113","114","115","116","700",
    "701","702","703","704","705","706","707","708",
    "709","710","711","712","713","714","715","717",
    "718","719","720","721","722","723","724","725",
    "726","727","728","729","740","741","742","743",
    "745","746","748","757","758","759","768","769",
    "790","791","792","793","794","795","796","797",
    "798","799"
]

airtel_prefixes = [
    "730","731","732","733","734","735","736","737",
    "738","739","750","751","752","753","754","755",
    "756","762","780","781","782","783","784","785",
    "786","787","788","789",
]
def get_telco_by_phone_number(phone_number):
    formatted_phone_number =""
    telco_prefix_2 = ""
    telco_prefix_3 = ""
    if phone_number:
        if phone_number[:3] == "254":
            formatted_phone_number =phone_number
        elif phone_number[0] =="0":
            formatted_phone_number = "254"+phone_number[1:]

    if formatted_phone_number:
        print("Formatted msisdn", formatted_phone_number)
        telco_prefix_2 = formatted_phone_number[3:5]
        print("Telco prefix 2", telco_prefix_2)
        if telco_prefix_2:
            if telco_prefix_2 =="10" or telco_prefix_2=="11":
                return "AIRTELMONEY", formatted_phone_number

        telco_prefix_3 = formatted_phone_number[3:6]
        if telco_prefix_3:
            print("Telco prefix 3", telco_prefix_3)
            if telco_prefix_3 in safaricom_prefixes:
                return "MPESA", formatted_phone_number
            elif telco_prefix_3 in airtel_prefixes:
                return "AIRTELMONEY", formatted_phone_number
            else:
                return None, formatted_phone_number
            
    else:
        return None, formatted_phone_number



