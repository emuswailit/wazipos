import pyotp
import json
from authentication.signals import generate_key
from intergrations.jambopay.jambopay_create_user_profile import create_jambopay_profile
from rest_framework import exceptions
from intergrations.jambopay.jambopay_create_whitelabel_account import create_white_label_account
from authentication.models import EntityBranches
from employees.validators import employees_models_validators
from ..utils import sacco_models_validators
from authentication.models import Users
from utils.logging import create_log
from intergrations.jambopay_swift.jambopay_swift_sms import send_swift_sms
from decouple import config
from core.phone_number_utils import get_telco_by_phone_number
from .. import models
from authentication.utils.utils import generate_reference_number
from intergrations.jambopay import jambopay_wallet
from employees.models import Employees
from django.db.models import Q


from intergrations.jambopay.jambopay_wallet import get_wallet_balance


def retrieve_member_account_balance(data,user):
    errors=[]
    employee = employees_models_validators.retrieve_employee_by_user_and_entity(user, user.entity)
    if not "accountNumber" in data or data["accountNumber"]=="":
        errors.append("Account number is required")
        return errors, None
    else:
        if models.MemberAccounts.objects.filter(accountNumber=data["accountNumber"]).exists():
            account = models.MemberAccounts.objects.filter(accountNumber=data["accountNumber"]).first()
            if account.accountAdministrator.user==user or  employee:
                payload = {
                    "account_number": account.accountNumber
                }
                errors, balance_json = get_wallet_balance(payload)
                if balance_json:
                    
                    return [], balance_json
                else:
                    return errors, None
            else:
                errors.append("Not authorized")
        else:
            errors.append("You have no payments account in the system")
            return errors,None


def create_loan_collateral(data,user):
    errors =[]
    member = None
    title = None
    description = None
    currentValue = 0.00

    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)

    if not "member" in data or data["member"]=="":
        errors.append("Sacco member ID is required")
        return errors, None
    else:
        member = sacco_models_validators.validate_sacco_member(data["employee"])

    if not "loanApplication" in data or data["loanApplication"]=="":
        errors.append("Loan application ID is required")
        return errors, None
    else:
        loanApplication = sacco_models_validators.validate_loan_application(data["loanApplication"])
        if len(loanApplication.collaterals.all())>5:
            errors.append("Not mre than 5 collaterals are permitted")
            return errors,None

    if not "title" in data or data["title"]=="":
        errors.append("Loan application ID is required")
        return errors, None
    else:
        title = data["title"]

    if not "currentValue" in data or data["currentValue"]=="":
        errors.append("Current value is required")
        return errors, None
    else:
        currentValue = float(["currentValue"])

    try:
        created = models.Collaterals.objects.create(
            member=member,
            loanApplication=loanApplication,
            title=title,
            description=description,
            currentValue=currentValue,
            entity=user.entity,
            madeBy=employee
            
        )
        if created:
            loanApplication.guarantors.add(created)
    except Exception as e:
        errors.append(str(e))
        return errors,None
    

def create_loan_guarantor(data,user):
    errors =[]
    member = None
    loanApplication = None
    guaranteedAmount = 0.00

    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)

    if not "member" in data or data["member"]=="":
        errors.append("Sacco member ID is required")
        return errors, None
    else:
        member = sacco_models_validators.validate_sacco_member(data["employee"])

    if not "loanApplication" in data or data["loanApplication"]=="":
        errors.append("Loan application ID is required")
        return errors, None
    else:
        loanApplication = sacco_models_validators.validate_loan_application(data["loanApplication"])
        if len(loanApplication.guarantors.all())>5:
            errors.append("Not mre than 5 guarantors are permitted")
            return errors,None

    if "guaranteedAmount" in data and not data["guaranteedAmount"]=="":
        guaranteedAmount=float(data["guaranteedAmount"])

    try:
        created = models.Guarantors.objects.create(
            member=member,
            loan=loanApplication,
            guaranteedAmount=guaranteedAmount,
            entity=user.entity,
            madeBy=employee
            
        )
        if created:
            loanApplication.guarantors.add(created)
    except Exception as e:
        errors.append(str(e))
        return errors,None
    

def create_cashier(data,user):
    errors =[]
    cashierEmployee = None
    description = None
    floatLimit = 0.00
    amount = 0.00
    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)

    if not "employee" in data or data["employee"]=="":
        errors.append("Employee to add as teller is required")
        return errors, None
    else:
        cashierEmployee = employees_models_validators.validate_employee_by_id_only(data["employee"])
        if not cashierEmployee.entity==employee.entity and not cashierEmployee.current_branch==employee.current_branch:
            errors.append("You can only add an employee from your branc as a teller")
            return errors, None

    if "floatLimit" in data and not data["floatLimit"]=="":
        floatLimit=float(data["floatLimit"])

    try:
        created = models.Cashiers.objects.create(
            employee=cashierEmployee,
            floatLimit=floatLimit,
            entity=user.entity,
            madeBy=employee
            
        )
    except Exception as e:
        errors.append(str(e))
        return errors,None
    
def get_branch_cashiers(user):
    sacco_cashiers =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
 

    if models.Cashiers.objects.filter(entity=user.entity,branch=employee.current_branch).exists():
        sacco_cashiers=models.Cashiers.objects.filter(entity=user.entity,branch=employee.current_branch).all()

    return sacco_cashiers


def create_teller(data,user):
    errors =[]
    tellerEmployee = None
    description = None
    floatLimit = 0.00
    amount = 0.00
    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)

    if not "employee" in data or data["employee"]=="":
        errors.append("Employee to add as teller is required")
        return errors, None
    else:
        tellerEmployee = employees_models_validators.validate_employee_by_id_only(data["employee"])
        if not tellerEmployee.entity==employee.entity and not tellerEmployee.current_branch==employee.current_branch:
            errors.append("You can only add an employee from your branc as a teller")
            return errors, None

    if "floatLimit" in data and not data["floatLimit"]=="":
        floatLimit=float(data["floatLimit"])

    try:
        created = models.Tellers.objects.create(
            employee=tellerEmployee,
            floatLimit=floatLimit,
            entity=user.entity,
            madeBy=employee
            
        )
    except Exception as e:
        errors.append(str(e))
        return errors,None
    
def get_branch_tellers(user):
    sacco_tellers =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
 

    if models.Tellers.objects.filter(entity=user.entity,branch=employee.current_branch).exists():
        sacco_tellers=models.Tellers.objects.filter(entity=user.entity,branch=employee.current_branch).all()

    return sacco_tellers






def create_sacco_dividend(data,user):
    errors =[]
    title = None
    description = None
    rate = 0.00
    amount = 0.00
    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)

    if not "rate" in data or data["rate"]=="":
        errors.append("Title is required")
        return errors, None
    else:
        rate = float(data["rate"])

    if "narrative" in data and not data["narrative"]=="":
        narrative=data["narrative"]

    if "periodFrom" in data and not data["periodFrom"]=="":
        periodFrom=data["periodFrom"]

    if "periodTo" in data and not data["periodTo"]=="":
        periodTo=data["periodTo"]



    try:
        created = models.Dividends.objects.create(
            rate=rate,
            narrative=narrative,
            periodFrom=periodFrom,
            periodTo=description,
            entity=user.entity,
            madeBy=employee
            
        )
    except Exception as e:
        errors.append(str(e))
        return errors,None

def create_sacco_charge(data,user):
    errors =[]
    title = None
    description = None
    rate = 0.00
    amount = 0.00
    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)

    if not "title" in data or data["title"]=="":
        errors.append("Title is required")
        return errors, None
    else:
        title = data["title"]

    if "description" in data and not data["description"]=="":
        description=data["description"]

    if "rate" in data and not data["rate"]=="":
        rate=float(data["rate"])

    if "amount" in data and not data["amount"]=="":
        amount=float(data["amount"])


    try:
        created = models.SaccoCharges.objects.create(
            title=title,
            rate=rate,
            amount=amount,
            description=description,
            entity=user.entity,
            madeBy=employee
            
        )
    except Exception as e:
        errors.append(str(e))
        return errors,None

def get_sacco_charges(user):
    sacco_charges =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
 
    if models.SaccoCharges.objects.filter(entity=user.entity,branch=employee.current_branch).exists():
        sacco_charges=models.SaccoCharges.objects.filter(entity=user.entity,branch=employee.current_branch).all()
    return sacco_charges


def get_sacco_dividends(user):
    sacco_charges =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
 
    if models.Dividends.objects.filter(entity=user.entity,branch=employee.current_branch).exists():
        sacco_charges=models.Dividends.objects.filter(entity=user.entity,branch=employee.current_branch).all()
    return sacco_charges


def create_loan(data,user):
    errors =[]
    loanApplication=None
    creditAccount=None
    loanOfficer=None
    amountApplied=0.00
    amountApproved=0.00
    currentInterest=0.00
    netPayable=0.00
    totalCharges=0.00
    startDate=None
    loanTerm=0
    saccoCharges=None
    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)
    if not "creditAccount" in data or data["creditAccount"]=="":
        errors.append("Credit account ID is required")
        return errors, None
    else:
        creditAccount = sacco_models_validators.validate_sacco_member_account(data["creditAccount"])

    if not "loanOfficer" in data or data["loanOfficer"]=="":
        errors.append("Loan officer ID is required")
        return errors, None
    else:
        loanOfficer = employees_models_validators.validate_employee_by_id_only(data["loanOfficer"])

    if not "loanApplication" in data or data["loanApplication"]=="":
        errors.append("Loan application ID is required")
        return errors, None
    else:
        loanApplication = sacco_models_validators.validate_loan_application(data["loanApplication"])
    
    
    if  "amountApproved" in data and not data["amountApproved"]=="":
        amountApproved = float(data["amountApproved"])

    if  "currentInterest" in data and not data["currentInterest"]=="":
        currentInterest = float(data["currentInterest"])

    if  "netPayable" in data and not data["netPayable"]=="":
        netPayable = float(data["netPayable"])

    if  "totalCharges" in data and not data["totalCharges"]=="":
        totalCharges = float(data["totalCharges"])

    if  "startDate" in data and not data["startDate"]=="":
        startDate = data["startDate"]
        
    if  "loanTerm" in data and not data["loanTerm"]=="":
        loanTerm = int(data["loanTerm"])

    if models.Loans.objects.filter(loanApplication=loanApplication).exists():
        errors.append("Loan for this application already exists")
        return errors,None
    try:
        created = models.Loans.objects.create(
            loanApplication=loanApplication,
            creditAccount=creditAccount,
            amountApplied=amountApplied,
            loanOfficer=loanOfficer,
            amountApproved=amountApproved,
            currentInterest=currentInterest,
            netPayable=netPayable,
            totalCharges=totalCharges,
            startDate=startDate,
            loanTerm=loanTerm,
            madeBy=employee,
            entity=employee.entity,
            branch=employee.current_branch
            
        )
        if created:
            return [], created
        
    except Exception as e:
        errors.append(str(e))
        return errors,None

def update_loan(data,user):
    pass

def create_loan_application(data,user):
    errors =[]
    memberAccount=None
    product=None
    loanReason=None
    product=None
    product=None
    grossSalary=0.00
    totalSalaryDeductions=0.00
    netSalary=0.00
    outstandingLoansValue=0.00
    outstandingLoansCount=0
    totalDeposits=0.00

    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)

    if not "memberAccount" in data or data["memberAccount"]=="":
        errors.append("Member account ID is required")
        return errors, None
    else:
        memberAccount = sacco_models_validators.validate_sacco_member_account(data["memberAccount"])

    if not "product" in data or data["product"]=="":
        errors.append("Sacco product ID is required")
        return errors, None
    else:
        product = sacco_models_validators.validate_sacco_product(data["product"])

    

    if not "amountApplied" in data or data["amountApplied"]=="":
        errors.append("Amount applied is required")
        return errors, None
    else:
        amountApplied = float(data["amountApplied"])

    if "grossSalary" in data and not  data["grossSalary"]=="":
        grossSalary = float(data["grossSalary"])

    if "totalSalaryDeductions" in data and not  data["totalSalaryDeductions"]=="":
        totalSalaryDeductions = float(data["totalSalaryDeductions"])

    if "netSalary" in data and not  data["netSalary"]=="":
        netSalary = float(data["netSalary"])

    if "outstandingLoansValue" in data and not  data["outstandingLoansValue"]=="":
        outstandingLoansValue = float(data["outstandingLoansValue"])


    if "outstandingLoansCount" in data and not  data["outstandingLoansCount"]=="":
        outstandingLoansCount = float(data["outstandingLoansCount"])

    if "totalDeposits" in data and not  data["totalDeposits"]=="":
        totalDeposits = float(data["totalDeposits"])


    if not "loanReason" in data or data["loanReason"]=="":
        errors.append("Loan request reason is required")
        return errors, None
    else:
        loanReason = data["loanReason"]

    if models.LoanApplications.objects.filter(memberAccount=memberAccount,product=product,status="PROCESSING").exists():
        errors.append("Similar application is still in progress")
        return errors,None

    try:
        created = models.LoanApplications.objects.create(
            memberAccount=memberAccount,
            product=product,
            amountApplied=amountApplied,
            loanReason=loanReason,
            registeredBy=employee,
            outstandingLoansCount=outstandingLoansCount,
            outstandingLoansValue=outstandingLoansValue,
            grossSalary=grossSalary,
            totalSalaryDeductions=totalSalaryDeductions,
            netSalary=netSalary,
            totalDeposits=totalDeposits,
            entity=memberAccount.entity,
            branch=memberAccount.branch
        )
    except Exception as e:
        errors.append(str(e))
        return errors,None


def update_loan_application(data,user):
    errors =[]
    loanApplication=None
    collaterals=None
    
    if not "loanApplication" in data or data["loanApplication"]=="":
        errors.append("Loan application ID  required")
        return errors, None
    else:
        loanApplication = sacco_models_validators.validate_loan_application(data["loanApplication"])


    if  "loanReason" in data and not data["loanReason"]=="":
        loanReason = data["loanReason"]
        loanApplication.loanReason=loanReason
        loanApplication.save()

    if  "amountApplied" in data and not data["amountApplied"]=="":
        amountApplied = float(data["amountApplied"])
        loanApplication.amountApplied=amountApplied
        loanApplication.save()

    if "grossSalary" in data and not  data["grossSalary"]=="":
        grossSalary = float(data["grossSalary"])
        loanApplication.grossSalary=grossSalary
        loanApplication.save()      

    if "totalSalaryDeductions" in data and not  data["totalSalaryDeductions"]=="":
        totalSalaryDeductions = float(data["totalSalaryDeductions"])
        loanApplication.totalSalaryDeductions=totalSalaryDeductions
        loanApplication.save() 
    if "netSalary" in data and not  data["netSalary"]=="":
        netSalary = float(data["netSalary"])
        loanApplication.netSalary=netSalary
        loanApplication.save() 

    if "outstandingLoansValue" in data and not  data["outstandingLoansValue"]=="":
        outstandingLoansValue = float(data["outstandingLoansValue"])
        loanApplication.outstandingLoansValue=outstandingLoansValue
        loanApplication.save() 

    if "outstandingLoansCount" in data and not  data["outstandingLoansCount"]=="":
        outstandingLoansCount = float(data["outstandingLoansCount"])
        loanApplication.outstandingLoansCount=outstandingLoansCount
        loanApplication.save() 

    if "totalDeposits" in data and not  data["totalDeposits"]=="":
        totalDeposits = float(data["totalDeposits"])
        loanApplication.totalDeposits=totalDeposits
        loanApplication.save() 

    if  "collaterals" in data and not data["collaterals"]=="":
        collaterals = data["collaterals"]

        my_collaterals= collaterals.split(",")

        for item in my_collaterals:
            if not item=="":
                if models.Collaterals.objects.filter(id=item).exists():
                    collateral=models.Collaterals.objects.filter(id=item).first()
                    
                    loanApplication.collaterals.add(collateral)

    if  "guarantors" in data and not data["guarantors"]=="":
        guarantors = data["guarantors"]

        my_guarantors= guarantors.split(",")

        for item in my_guarantors:
            if not item=="":
                if models.Guarantors.objects.filter(id=item).exists():
                    collateral=models.Guarantors.objects.filter(id=item).first()
                    
                    loanApplication.guarantors.add(collateral)

    return [],loanApplication

def get_loan_applications(user):
    loan_applications =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
 

    if models.LoanApplications.objects.filter(entity=user.entity,branch=employee.current_branch).exists():
        loan_applications=models.LoanApplications.objects.filter(entity=user.entity,branch=employee.current_branch).all()
    return loan_applications



def create_member_referee(data,user):
    errors =[]
    member = None
    relation = None
    firstName = None
    lastName = None
    identifierType = None
    identifierNumber = None
    gender = None
    phone = None
    email = None
    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)
    if not "member" in data or data["member"]=="":
        errors.append("Member ID is required")
    else:
        member = sacco_models_validators.validate_sacco_member(data["member"])
    

    if not "firstName" in data or data["firstName"]=="":
        errors.append("First name is required")
        return errors, None
    else:
        firstName = data["firstName"]

    if not "lastName" in data or data["lastName"]=="":
        errors.append("Last name is required")
        return errors, None
    else:
        lastName = data["lastName"]

    if not "gender" in data or data["gender"]=="":
        errors.append("Next of kin gender is required")
        return errors, None
    else:
        gender = data["gender"]

    if not "identifierType" in data or data["identifierType"]=="":
        errors.append("Next of kin identifierType is required")
        return errors, None
    else:
        identifierType = data["identifierType"]

    if not "identifierNumber" in data or data["identifierNumber"]=="":
        errors.append("Next of kin identifierNumber is required")
        return errors, None
    else:
        identifierNumber = data["identifierNumber"]
    
    
    if not "phone" in data or data["phone"]=="":
        errors.append("Next of kin phone is required")
        return errors, None
    else:
        phone = data["phone"]


    if not "email" in data or data["email"]=="":
        errors.append("Next of kin email is required")
        return errors, None
    else:
        email = data["email"]

    try:
        created = models.Referees.objects.create(
            member=member,
            firstName=firstName,
            lastName=lastName,
            gender=gender,
            identifierType=identifierType,
            identifierNumber=identifierNumber,
            madeBy=employee
        )
    except Exception as e:
        errors.append(str(e))
        return errors,None
    
def create_member_next_of_kin(data,user):
    errors =[]
    member = None
    relation = None
    firstName = None
    lastName = None
    identifierType = None
    identifierNumber = None
    gender = None
    phone = None
    email = None
    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)
    if not "member" in data or data["member"]=="":
        errors.append("Member ID is required")
    else:
        member = sacco_models_validators.validate_sacco_member(data["member"])
    
    if not "relation" in data or data["relation"]=="":
        errors.append("Relation to member is required")
        return errors, None
    else:
        relation = data["relation"]

    if not "firstName" in data or data["firstName"]=="":
        errors.append("First name is required")
        return errors, None
    else:
        firstName = data["firstName"]

    if not "lastName" in data or data["lastName"]=="":
        errors.append("Last name is required")
        return errors, None
    else:
        lastName = data["lastName"]

    if not "gender" in data or data["gender"]=="":
        errors.append("Next of kin gender is required")
        return errors, None
    else:
        gender = data["gender"]

    if not "identifierType" in data or data["identifierType"]=="":
        errors.append("Next of kin identifierType is required")
        return errors, None
    else:
        identifierType = data["identifierType"]

    if not "identifierNumber" in data or data["identifierNumber"]=="":
        errors.append("Next of kin identifierNumber is required")
        return errors, None
    else:
        identifierNumber = data["identifierNumber"]

    if not "phone" in data or data["phone"]=="":
        errors.append("Next of kin phone is required")
        return errors, None
    else:
        phone = data["phone"]

    if not "email" in data or data["email"]=="":
        errors.append("Next of kin email is required")
        return errors, None
    else:
        email = data["email"]

    try:
        created = models.NextOfKins.objects.create(
            member=member,
            firstName=firstName,
            lastName=lastName,
            gender=gender,
            identifierType=identifierType,
            identifierNumber=identifierNumber,
            relation=relation,
            madeBy=employee
        )
    except Exception as e:
        errors.append(str(e))
        return errors,None



def create_sacco_account(data,user):
    errors =[]
    accountType = None
    accountName = None
    accountDescription = None
    accountAdministrator=None
    signatories= None
    employee = None
    saccoMsisdn = None
    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)
    if models.SaccoMsisdns.objects.filter(entity=user.entity,branch=employee.current_branch).exists():
        saccoMsisdn= models.SaccoMsisdns.objects.filter(entity=user.entity,branch=employee.current_branch).first()
    else:
        errors.append("No sacco msisdn has been created for this entity")
        return errors, None


    if not "accountType" in data or data["accountType"]=="":
        errors.append("Account type  is required")
        return errors, None
    else:
        accountType = data["accountType"]




    if not "accountName" in data or data["accountName"]=="":
        errors.append("Account name  is required")
        return errors, None
    else:
        accountName = data["accountName"]

    if not "accountDescription" in data or data["accountDescription"]=="":
        errors.append("Account description  is required")
        return errors, None
    else:
        accountDescription = data["accountDescription"]

    # if not "signatories" in data or data["signatories"]=="":
    #     errors.append("Signatories IDs are  is required")
    #     return errors, None
    # else:
    #     signatories = data["signatories"]

    
    if employee:
        
        if not employee.user.is_jp_profile_updated:
            cty = "toUpdate"
            if employee.user.county:
                cty = employee.user.county.title
            # Create new profile
  
            profile_data = {
                    "firstName": employee.user.first_name,
                    "lastName": employee.user.last_name,
                    "identityNumber": employee.user.identifier_number,
                    "identityType": employee.user.identifier_type,
                    "phoneNumber": saccoMsisdn.msisdn,
                    "gender": employee.user.gender,
                    "dateOfBirth":employee.user.date_of_birth,
                    "county": cty,
                    "physicalAddress": cty,
                    "email": employee.user.email
                    }
       

            errors, profile = create_jambopay_profile(profile_data)
            if profile:
                employee.user.is_jp_profile_updated = True
                employee.user.save()
                accountAdministrator = employee.user   
        else:
            pass  
        

        if models.SaccoAccounts.objects.filter(accountType=accountType,branch=employee.current_branch, administrator=accountAdministrator).exists():
                print(f"User has am account of typt {accountType}")
                errors.append(f"Sacco has an account of type {accountType} already") 
                return errors, None
        else:
        
            telco, phone_number = get_telco_by_phone_number(saccoMsisdn.msisdn)
          
            data=json.dumps({  "currency": "KES",
                    "phoneNumber":phone_number, 
                    "name": f"{accountName}",
                    "description": accountDescription,
                    "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                    "accountType": "Individual",
                        })

            errors, account =create_white_label_account(data)
            if account:
                try:
                    created = models.SaccoAccounts.objects.create(
                            accountNumber=account["accountNo"],
                            accountName=account["name"],
                            currency=account["currency"],
                            accountPhone=saccoMsisdn.msisdn,
                            branch= employee.current_branch,
                            accountDescription=accountDescription,
                            accountType=accountType,
                            entity=user.entity,
                            madeBy=employee,
                            administrator=accountAdministrator
                    )
                    if created:
                        # my_signatories= signatories.split(",")
                    
                        # for sign in my_signatories:
                        #     if not sign=="":
                        #         if models.Members.objects.filter(id=sign).exists():
                        #             signatory=models.Members.objects.filter(id=sign).first()
                                
                        #             created.signatories.add(signatory)
                        return [], created
                except Exception as e:
                    errors.append(str(e))
                    return errors, None
            elif errors:
                print("erors at create", errors)
                return errors, None


       


def create_member_account_transaction_transaction(data,user):
    errors=[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)
    memberAccount = None
    transactionType = None
    destinationAccountType = None
    externalAccountToNumber = None
    externalAccountToRef = None
    memberAccountTo = None
    saccoAccountTo = None
    walletPin=""
    transactionAmount = 0.00
    if not "memberAccount" in data or data["memberAccount"]=="":
        errors.append("Member account ID is required")
        return errors, None
    else:
        memberAccount = sacco_models_validators.validate_sacco_member_account(data["memberAccount"])
        
    if not "transactionType" in data or data["transactionType"]=="":
        errors.append("Member account ID is required")
        return errors, None
    else:
        transactionType = data["transactionType"]

    if not "transactionAmount" in data or data["transactionAmount"]=="":
        errors.append("Member account ID is required")
        return errors, None
    else:
        transactionAmount = float(data["transactionAmount"])

    if not "destinationAccountType" in data or data["destinationAccountType"]=="":
        errors.append("Member account ID is required")
        return errors, None
    else:
        destinationAccountType = data["destinationAccountType"]
    
    if "externalAccountToNumber" in data and not data["externalAccountToNumber"]=="":
        externalAccountToNumber= data["externalAccountToNumber"]

    if "externalAccountToRef" in data and not data["externalAccountToRef"]=="":
        externalAccountToRef= data["externalAccountToRef"]

    if "externalBankCode" in data and not data["externalBankCode"]=="":
        externalBankCode= data["externalBankCode"]

    if "memberAccounTo" in data and not data["memberAccounTo"]=="":
        memberAccounTo= data["memberAccounTo"]

    if "saccoAccounTo" in data and not data["saccoAccounTo"]=="":
        saccoAccounTo= data["saccoAccounTo"]

    if "walletPin" in data and not data["walletPin"]=="":
        walletPin= data["walletPin"]
    
    try:
        reference_number=generate_reference_number(memberAccount.entity,user)
        created = models.MemberAccountTransactions.objects.create(
            branch = memberAccount.branch,
            memberAccount=memberAccount,
            transactionType=transactionType,
            transactionAmount=transactionAmount,
            externalAccountToNumber=externalAccountToNumber,
            saccoAccounTo=saccoAccounTo,
            memberAccounTo=memberAccounTo,
            destinationAccountType=destinationAccountType,
            externalBankCode=externalBankCode,
            madeBy=user,
            reference_number = reference_number
        )
        if created:
            if created.destinationAccountType=="MPESA":
                payload = json.dumps({
                            "amount": int(transactionAmount),
                            "accountFrom": memberAccount.accountNumber, 
                            "orderId": reference_number,
                            "provider": "MOMO_B2C",
                            "payTo": {
                                "accountRef": externalAccountToNumber,
                                "accountNumber":externalAccountToNumber
                            },
                            "callBackUrl": "https://webhook.site/5a0465a2-3e53-4955-b1ab-50c805102343",
                            "narration": "Send Money to MPesa",
                            "verificationType":"PIN"
    
                            })
                errors, result = jambopay_wallet.payout_from_wallet_to_mpesa_2(payload)
                if result:
                      jambopay_wallet.jambopay_authorize_wallet_payout(walletPin, result["ref"])
                      return [],created
                else:
                    return errors, None
            elif created.destinationAccountType=="AIRTEL":
                payload = json.dumps({
                            "amount": int(transactionAmount),
                            "accountFrom": memberAccount.accountNumber, 
                            "orderId": reference_number,
                            "provider": "MOMO_B2C",
                            "payTo": {
                                "accountRef": externalAccountToNumber,
                                "accountNumber":externalAccountToNumber
                            },
                            "callBackUrl": "https://webhook.site/5a0465a2-3e53-4955-b1ab-50c805102343",
                            "narration": "Send Money to Airtel Money",
                            "verificationType":"PIN"
    
                            })
                errors, result = jambopay_wallet.payout_from_wallet_to_airtel(payload)
                if result:
                      jambopay_wallet.jambopay_authorize_wallet_payout(walletPin, result["ref"])
                      return [],created
                else:
                    return errors, None
            elif created.destinationAccountType=="PAYBILL":
                payload = json.dumps({
                    "amount": int(transactionAmount),
                    "accountFrom": memberAccount.accountNumber, 
                    "orderId": reference_number,
                    "provider": "MOMO_B2B",
                    "payTo": {
                        "accountRef": externalAccountToRef,
                        "accountNumber": externalAccountToNumber,
                    },
                    "callBackUrl": "https://webhook.site/7a311d8a-7c1b-4195-8640-e95e5ad616b3",
                    "narration": "Payout to Paybill",
                     "verificationType":"PIN"
                })
                errors, result = jambopay_wallet.payout_from_wallet_to_paybill(payload)
                if result:
                      jambopay_wallet.jambopay_authorize_wallet_payout(walletPin, result["ref"])
                      return [],created
                else:
                    return errors, None
            elif created.destinationAccountType=="BANK":
                payload = json.dumps({
                    "amount": int(transactionAmount),
                    "accountFrom": memberAccount.accountNumber,
                    "orderId": reference_number,
                    "provider": "BANK",
                    "payTo": {
                        "accountRef": externalAccountToRef,
                        "accountNumber":externalAccountToNumber,
                        "bankCode": externalBankCode,
                    },
                    "callBackUrl": "https://webhook.site/f6cda98d-3773-401b-ae2b-f430b6affb31",
                    "narration": "Wallet account withdrawal to bank",
                    "verificationType":"PIN"
            
                })
                errors, result = jambopay_wallet.payout_from_wallet_to_paybill(payload)
                if result:
                      jambopay_wallet.jambopay_authorize_wallet_payout(walletPin, result["ref"])
                      return [],created
                else:
                    return errors, None
            elif created.destinationAccountType=="TILL":
      
                errors, result = jambopay_wallet.payout_from_wallet_to_till(memberAccount.accountNumber,externalAccountToNumber,transactionAmount,reference_number)
                if result:
                      jambopay_wallet.jambopay_authorize_wallet_payout(walletPin, result["ref"])
                      return [],created
                else:
                    return errors, None

    except Exception as e:
        errors.append(str(e))
        return errors,None




def get_sacco_products(user):
    sacco_products =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
 

    if models.SaccoProducts.objects.filter(entity=user.entity,).exists():
        sacco_products=models.SaccoProducts.objects.filter(entity=user.entity,).all()
    return sacco_products

def get_sacco_member_accounts(user):
    sacco_member_accounts =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
 

    if models.MemberAccounts.objects.filter(entity=user.entity,branch=employee.current_branch).exists():
        sacco_member_accounts=models.MemberAccounts.objects.filter(entity=user.entity,branch=employee.current_branch).all()
    return sacco_member_accounts

def get_sacco_accounts(user):
    sacco_accounts =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
 

    if models.SaccoAccounts.objects.filter(entity=user.entity,branch=employee.current_branch).exists():
        sacco_accounts=models.SaccoAccounts.objects.filter(entity=user.entity,branch=employee.current_branch).all()
    return sacco_accounts

def get_sacco_member_loans(user):
    sacco_member_accounts =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)

    if models.Loans.objects.filter(entity=user.entity,branch=employee.current_branch).exists():
        sacco_member_accounts=models.Loans.objects.filter(entity=user.entity,branch=employee.current_branch).all()
    return sacco_member_accounts

def search_branch_sacco_members (data,user):
    sacco_members =[]
    searchQuery=""
    phone =None

    if "searchQuery" in data and not data["searchQuery"]==None:
        searchQuery = data["searchQuery"]

        if(len(searchQuery)==10 and searchQuery[0]=="0"):

            telco, phone_number = get_telco_by_phone_number(searchQuery)
            if phone_number:
                sacco_members= models.Members.objects.filter(
                     Q(user__phone__iexact=phone_number)
                )
        else:
            telco, phone_number = get_telco_by_phone_number(searchQuery)
            sacco_members= models.Members.objects.filter(
                Q(user__identifier_number__iexact=phone_number) |  Q(user__phone__iexact=phone_number)
            )
    
    return sacco_members

def get_branch_sacco_members(user):
    sacco_members =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
 

    if models.Members.objects.filter(entity=user.entity,branch=employee.current_branch).exists():
        sacco_members=models.Members.objects.filter(entity=user.entity,branch=employee.current_branch).all()

    return sacco_members

def get_branch_sacco_employees(user):
    sacco_members =[]
    employee = employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
 

    if Employees.objects.filter(entity=user.entity,current_branch=employee.current_branch).exists():
        sacco_members=Employees.objects.filter(entity=user.entity,current_branch=employee.current_branch).all()

    return sacco_members

def create_sacco_products(data,user):
    errors =[]
    title = None
    interestRate =0.0
    maximumPeriodIMonths =0.0
    description =""
    employee =employees_models_validators.validate_employee_by_user_and_entity(user.id,user.entity)
    if not "title" in data or data["title"]=="":
        errors.append("Title is required")
        return errors,None

    else:
        title = data["title"]
    
    if "interestRate" in data and not data["interestRate"]=="":
        interestRate = float(data["interestRate"])

    if "maximumPeriodIMonths" in data and not data["maximumPeriodIMonths"]=="":
        maximumPeriodIMonths = float(data["maximumPeriodIMonths"])

    if "description" in data and not data["description"]=="":
        description = float(data["description"])



    if models.SaccoProducts.objects.filter(title=title.upper(),entity=user.entity).exists():
        errors.append("Item with similar title already exists for your entity branch")
        return errors,None
    else:
        try:
            created=models.SaccoProducts.objects.create(entity=user.entity,
                                                title=title,description=description,
                                                interestRate=interestRate,
                                                maximumPeriodIMonths=maximumPeriodIMonths,
                                                madeBy=employee,
                                                isActive="true"
                                                )
            if created:
                return [],created
        except Exception as e:
            errors.append(str(e))
            return errors,[]
        

def update_sacco_product(data,user):
    sacco_product = None
    errors =[]
    if not "sacco_product" in data or data["sacco_product"]=="":
        errors.append("Sacco product ID is required")
        return errors, None
    else:
        sacco_product= sacco_models_validators.validate_sacco_product(data["sacco_product"])

    return [],


def send_new_password(user):
    from core.utils import  generate_password
    generated_password = generate_password()
    print("generated_password",generated_password.upper())
    create_log("info",f"pw change : {user.phone} : {generated_password}")
    user.set_password(generated_password)
    user.save()
    message =f"Your Wazipos secret is {generated_password} .Keep it yor secret. Do NOT share with any person"
    payload = {
            "contact" : user.phone,
            "message" : message,
            "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
            "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
        }

    errors, sent = send_swift_sms(payload)
    return user

def verify_sacco_member_otp(data,user):
    user =None
    otp = None
    errors =[]
    validate = None
    if "phone" in data and not data["phone"]=="":
        telco, phone_number = get_telco_by_phone_number(data["phone"])
        if phone_number:
            if Users.objects.filter(phone=phone_number).exists():

                user = Users.objects.filter(phone=phone_number).first()
                if user.phone_otp_verified=="true":
                    print("at OTP",user.phone_otp_verified)
                    errors.append("Phone number is already OTP verified")
                    return [],user
            else:
                errors.append("User with provided phone number does not exists")
                return errors,None
            
    else:
        errors.append("Phone number is required")
        return errors, None

    if "otp" in data and not data["otp"]=="":
        otp = data["otp"]
    else:
        errors.append("OTP is required") 
        return errors, None

    try:
        validate = user.authenticate(int(otp))
        print("Validate",validate)
        if validate:
            user.phone_otp_verified = "true"
            user.is_verified="true"
            user.is_profile_verified=True   
            user.save()
            new_user=send_new_password(user)
    
            return [],new_user
        else:
            errors.append("OTP not verified. Please resend and try validation afresh")
            return errors, None
    except Exception as e:
        print("Should print")
        print("error at verify otp", str(e))
        return str(e), None



def generate_otp(user):
    time_otp = None
    if user.phone_otp_verified == "true":
        raise exceptions.ValidationError("Phone number is already OTP verified")
    # Time based otp

    if user.key:
        time_otp = pyotp.TOTP(user.key, interval=300, digits=4)
        time_otp = time_otp.now()
        print("User has key", user.key)
    else:
        print("User no key")
        user.key = generate_key()
        print("New generated  key", user.key)
        user.save()
    time_otp = pyotp.TOTP(user.key, interval=300, digits=4)
    time_otp = time_otp.now()

    return time_otp


def send_sacco_user_sms_code(data):
    errors =[]
    user = None
    phone_number=None
    if "phone" in data and not data["phone"]=="":
        telco, phone_number = get_telco_by_phone_number(data["phone"])
        if Users.objects.filter(phone=phone_number).exists():
            user = Users.objects.filter(phone=phone_number).first()
        else:
            errors.append("User with provided phone number not found")
            return errors,None
    else:
        errors.append("Phone number is required")
        return errors, None

    time_otp = None
    if user.phone_otp_verified == "true":
        errors.append("Phone number is already OTP verified")
        return errors, None
    # Time based otp
    else:
        if user.key:
            time_otp = pyotp.TOTP(user.key, interval=300, digits=4)
            time_otp = time_otp.now()
            print("User has key", user.key)
        else:
            print("User no key")
            user.key = generate_key()
            print("New generated  key", user.key)
            user.save()
    time_otp = pyotp.TOTP(user.key, interval=300, digits=4)
    time_otp = time_otp.now()
    message =f"{user.entity} verification code id {time_otp}"
    payload = {
            "contact" : user.phone,
            "message" : message,
            "callback" : "https://webhook.site/4028cefd-2c36-4391-a77d-1c8ef130fbac",
            "sender_name" : config("JAMBOPAY_SWIFT_SENDER_NAME")
        }

    errors, sent = send_swift_sms(payload)
    print("errrors",errors)
    print("sent",sent)
    if sent and sent["message_id"] and sent["telco"]:
        return None, user
    else:
        return ["An error occurred"],None
    


def create_member_account(data,user):
    errors =[]
    signs =[]
    accountAdministrator = None
    accountNature = None
    accountType = None
    signatories =None
    employee = employees_models_validators.validate_employee_by_user_and_entity(user,user.entity)

    if not "accountAdministrator" in data or data["accountAdministrator"]=="":
        errors.append("Sacco member ID is required")
        return errors, None
    else:
        accountAdministrator = sacco_models_validators.validate_sacco_member(data["accountAdministrator"])
        print("user",accountAdministrator.user)

        if not accountAdministrator.user.is_jp_profile_updated:
            cty = "toUpdate"
            if accountAdministrator.user.county:
                cty = accountAdministrator.user.county.title
            # Create new profile
  
            profile_data = {
                    "firstName": accountAdministrator.user.first_name,
                    "lastName": accountAdministrator.user.last_name,
                    "identityNumber": accountAdministrator.user.identifier_number,
                    "identityType": accountAdministrator.user.identifier_type,
                    "phoneNumber": accountAdministrator.user.phone,
                    "gender": accountAdministrator.user.gender,
                    "dateOfBirth":accountAdministrator.user.date_of_birth,
                    "county": cty,
                    "physicalAddress": cty,
                    "email": accountAdministrator.user.email
                    }
       

            errors, profile = create_jambopay_profile(profile_data)
            if profile:
                accountAdministrator.user.is_jp_profile_updated = True
                accountAdministrator.user.save()
     
            
        else:
            pass    
    
    if not "accountNature" in data or data["accountNature"]=="":
        errors.append("Account nature is required")
        return errors, None
    else:
        accountNature= data["accountNature"]

    if not "accountType" in data or data["accountType"]=="":
        errors.append("Account type is required")
        return errors, None
    else:
        accountType= data["accountType"]

    if not "signatories" in data or data["signatories"]=="":
        errors.append("Signatories IDs are required")
        return errors, None
    else:
        signatories= data["signatories"]
        my_signatories= signatories.split(",")
                
        for sign in my_signatories:
            if not sign=="":
                if models.Members.objects.filter(id=sign).exists():
                    signatory=models.Members.objects.filter(id=sign).first()
                    signs.append(signatory)



    if models.MemberAccounts.objects.filter(accountType=accountType,accountAdministrator=accountAdministrator).exists():
            print(f"User has am account of typt {accountType}")
    else:
       
        telco, phone_number = get_telco_by_phone_number(accountAdministrator.user.phone)
        print("new account can be created",phone_number)
        data=json.dumps({  "currency": "KES",
                "phoneNumber":phone_number, 
                "name": f"{accountAdministrator.user.first_name} {accountAdministrator.user.last_name}",
                "description": accountType,
                "accountNo": config("WAZIPOS_JAMBOPAY_WHITELABEL_ACCOUNT"), 
                "accountType": accountNature
                    })

        errors, account =create_white_label_account(data)
        if account:
            try:
                created = models.MemberAccounts.objects.create(
                        accountNumber=account["accountNo"],
                        accountName=account["name"],
                        currency=account["currency"],
                        accountPhone=accountAdministrator.user.phone,
                        branch= employee.current_branch,
                        accountNature=accountNature,
                        accountType=accountType,
                        entity=user.entity,
                        madeBy=employee,
                        accountAdministrator=accountAdministrator
                )
                if created:
                    my_signatories= signatories.split(",")
                   
                    for sign in my_signatories:
                        if not sign=="":
                            if models.Members.objects.filter(id=sign).exists():
                                signatory=models.Members.objects.filter(id=sign).first()
                               
                                created.signatories.add(signatory)
                    return [], created
            except Exception as e:
                errors.append(str(e))
                return errors, None
        else:
            return errors, None


        
def update_member_account(data,user):
    errors =[]
    memberAccount = None
    accountAdministrator = None
    if not "memberAccount" in data or data["memberAccount"]=="":
        errors.append("Member account ID is required")
        return errors, None
    else:
        memberAccount = sacco_models_validators.validate_sacco_member_account(data["memberAccount"])


    if "accountAdministrator" in data and not data["accountAdministrator"]=="":
        accountAdministrator=sacco_models_validators.validate_sacco_member(data["accountAdministrator"])
        if memberAccount.accountNature=="INDIVIDUAL":
            if not memberAccount.accountAdministrator:
                memberAccount.accountAdministrator=accountAdministrator
                memberAccount.save()

    if "signatories" in data and not data["signatories"]=="":
        signatories = data["signatories"]

        my_signatories= signatories.split(",")
                   
        for sign in my_signatories:
            if not sign=="":
                if models.Members.objects.filter(id=sign).exists():
                    signatory=models.Members.objects.filter(id=sign).first()
                    
                    memberAccount.signatories.add(signatory)
                    memberAccount.save()
    return [],memberAccount

    



