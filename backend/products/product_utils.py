from products.models import Products
from django.db import transaction
from itertools import product
from rest_framework import exceptions
from .models import Products
from authentication.models import Categories, Entities
from drugs.models import Preparation
from django.db.models import Q
from utils.logging import create_log

def validate_product_data(data):
    errors = []
    preparation = None
    category = None
    try:
        product_details = data["product_details"]

    except KeyError:
        errors.append("Product details are required")
    try:
        title = data["product_details"]["title"]
        if Products.objects.filter(title=title).exists():
            errors.append('Product with similar title exists')
        if data["product_details"]["title"] == "":
            errors.append("Title cannot be empty")

    except KeyError:
        errors.append("Entity title is required")
    try:
        units_per_pack = data["product_details"]["units_per_pack"]
        if int(units_per_pack) < 1:
            errors.append("Units per pack must be a number greater than 1")

    except KeyError:
        errors.append("Units per pack is required")
    try:
        manufacturer = data["product_details"]["manufacturer"]
        if manufacturer:
            # 🌟 Check if the entity is EITHER a General or Pharmaceutical Manufacturer
            if Entities.objects.filter(
                id=manufacturer, 
                entity_type__in=["GeneralManufacturer", "PharmaceuticalManufacturer"]
            ).exists():
                pass
            else:
                errors.append("Manufacturer with provided ID does not exist or is not a valid manufacturer type.")
        else:
            errors.append("Manufacturer ID is required")
    except KeyError:
        errors.append("Manufacturer ID is required")

    try:
        category_id = data["product_details"]["category"]
        if category_id:
            if Categories.objects.filter(id=category_id).exists():
                category = Categories.objects.filter(id=category_id).first()
                pass
            else:
                errors.append("Category with provided ID does not exist")

    except KeyError:
        errors.append("Category ID is required")

    if 'preparation' in data["product_details"] and data["product_details"]["preparation"]:
        preparation_id = data["product_details"]["preparation"]
        if preparation_id:
            if Preparation.objects.filter(id=preparation_id).exists():
                preparation = Preparation.objects.filter(id=preparation_id).first()
                
                # 🌟 Define all valid pharmaceutical entity types
                PHARMA_ENTITY_TYPES = {
                    "PharmaceuticalRetailer", 
                    "PharmaceuticalWholesaler", 
                    "PharmaceuticalDistributor", 
                    "PharmaceuticalManufacturer",
                    "Clinic",
                    "Hospital",
                    "Dispensary"
                }
                
                # Get the allowed entities sent from the frontend
                allowed_entities = data["product_details"].get("allowed_entities", [])
                
                # Check if any non-pharma entities were selected
                invalid_entities = [e for e in allowed_entities if e not in PHARMA_ENTITY_TYPES]
                
                if preparation and invalid_entities:
                    errors.append(
                        f"Drug products can only be assigned to pharmaceutical entity types. Invalid: {', '.join(invalid_entities)}"
                    )
            else:
                errors.append(
                    "Drug preparation with provided ID does not exist"
                )

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def get_product_details(data, user):
    try:
        product_id = data["product"]
        if Products.objects.filter(id=product_id).exists():
            product = Products.objects.filter(id=product_id).first()

            return product

    except KeyError:
        raise exceptions.ValidationError("Product ID is required")


def create_product(data, user):
    preparation = None
    if data["product_details"]["preparation"]:
        preparation_id = data["product_details"]["preparation"]
        if preparation_id:
            if Preparation.objects.filter(id=preparation_id).exists():
                preparation = Preparation.objects.filter(
                    id=preparation_id).first()
    try:
        created = Products.objects.create(
            title=data["product_details"]["title"],
            units_per_pack=data["product_details"]["units_per_pack"],
            is_vatable=data["product_details"]["is_vatable"],
            preparation=preparation,
            category_id=data["product_details"]["category"],
            manufacturer_id=data["product_details"]["manufacturer"],
            owner=user,
            entity=user.entity,
        )
        if created:
            return created
        else:
            return None
    except Exception as e:
        raise exceptions.ValidationError(e)

def get_all_products(user):
    if user.is_staff:
        # Return all products for admin user
        return Products.objects.filter(active=True)
    else:    
        queryset = Products.objects.filter(active=True)
        
        # Safely check if the user has an entity
        if not user.entity:
            return queryset.none()
            
        entity_type = str(user.entity.entity_type).strip()
        create_log("info",f"User entity typr { str(user.entity.entity_type).strip()}")
        
        if entity_type:
            # 🌟 Use __overlap for ArrayField. It checks if the array contains the entity_type.
            queryset = queryset.filter(allowed_entities__overlap=[entity_type])
            
        return queryset
    
def get_client_products(user):
    print
    if user.is_staff:
        # Return all product for admin user
        return Products.objects.filter(active=True)
    else:
        # Return only products for caegories assigned to user

        authorized_products = []

        if Products.objects.filter(is_pom=False, active=True).exists():
            authorized_products = Products.objects.filter(
                is_pom=False, active=True).all()
        return authorized_products


def get_products_by_category(data):
    if not data['category_id'] or data['category_id'] == "":
        raise exceptions.ValidationError('Category id is required')
    else:
        if Products.objects.filter(category_id=data['category_id']).exists():
            return Products.objects.filter(category_id=data['category_id']).all()
        else:
            return None


from rest_framework import exceptions
from django.db import transaction

@transaction.atomic
def update_product(data, user=None):
    product_id = data.get("id")
    if not product_id:
        raise exceptions.ValidationError("Product ID is required")

    # Fetch the product once
    product = Products.objects.filter(id=product_id).first()
    if not product:
        raise exceptions.ValidationError("Product not found")

    try:
        # Update preparation safely
        if "preparation" in data:
            if data["preparation"]:
                product.preparation_id = data["preparation"]
            else:
                product.preparation = None

        # Update standard fields
        if "category" in data:
            product.category_id = data["category"]
        if "manufacturer" in data:
            product.manufacturer_id = data["manufacturer"]
        if "title" in data:
            product.title = data["title"]
        if "description" in data:
            product.description = data["description"]
        if "is_pom" in data:
            product.is_pom = data["is_pom"]

        # 🌟 RESET & ADD ALLOWED ENTITIES FRESH
        if "allowed_entities" in data:
            new_entities = data.get("allowed_entities")
            
            if isinstance(new_entities, list) and len(new_entities) > 0:
                # Completely replace old entities with the new unique list
                product.allowed_entities = list(set(new_entities))
            else:
                # If the list is empty or invalid, clear the array completely
                product.allowed_entities = []

        # Save the product once at the end
        product.save()

        return product

    except Exception as e:
        # Catch specific error so the frontend knows exactly what broke
        raise exceptions.ValidationError(f"Product not updated: {str(e)}")
def search_products(data, user):
    products = []
    # Search through all products for admin users
    if user.is_staff:
        products = Products.objects.filter(
            Q(title__icontains=data['searchQuery']) | Q(
                preparation__title__icontains=data['searchQuery'])
        )
    else:
        # Search through only products products within allowed categories for user entity for non admin users
        products = Products.objects.filter(Q(category__in=user.entity.categories.all()) &
                                           Q(title__icontains=data['searchQuery']) | Q(
            preparation__title__icontains=data['searchQuery'])
        )
    # products = Products.objects.filter(
    #     Q(title__icontains=data['searchQuery']) | Q(
    #         preparation__title__icontains=data['searchQuery'])
    # )
    return products

def search_products_by_customer(data, user):
    products = Products.objects.filter(
            Q(title__icontains=data['searchQuery'])).filter(is_pom=False)

    return products



def search_drug_products(data,user):
    filtered=[]
    if "searchQuery" in data and not data["searchQuery"]==None and len(data["searchQuery"])>=2:
        if Products.objects.filter(
            Q(category__title="PHARMACEUTICALS")&
        Q(title__icontains=data["searchQuery"])
        | Q(preparation__title__icontains=data["searchQuery"])
        | Q(manufacturer__title__icontains=data["searchQuery"])
        
        ).exists():
            filtered = Products.objects.filter(
                Q(category__title="PHARMACEUTICALS")& 
            Q(title__icontains=data["searchQuery"])
            | Q(preparation__title__icontains=data["searchQuery"])
            | Q(manufacturer__title__icontains=data["searchQuery"])
            
        ).all()
    
    return filtered
