from products.models import Products
from django.db import transaction
from itertools import product
from rest_framework import exceptions
from .models import Products
from authentication.models import Categories, Entities
from drugs.models import Preparation
from django.db.models import Q


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
            if Entities.objects.filter(
                id=manufacturer, entity_type="MANUFACTURING"
            ).exists():
                pass
            else:
                errors.append("Manufacturer with provided ID does not exist")
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
                preparation = Preparation.objects.filter(
                    id=preparation_id).first()
                if preparation and category.title != "PHARMACY":
                    errors.append(
                        "Drug products can only be assigned to pharmacy category"
                    )
                pass
            else:
                errors.append(
                    "Drug preparation with provided ID does not exist")

    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def get_product_details(data, user):
    try:
        product_id = data["product"]
        if Products.objects.filter(id=product_id).exists():
            product = Products.objects.get(id=product_id)

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
    print
    if user.is_staff:
        # Return all product for admin user
        return Products.objects.filter(active=True)
    else:
        # Return only products for caegories assigned to user

        authorized_products = []

        # if Products.objects.filter(category__in=user.entity.categories.all(), active=True).exists():
        #     authorized_products = Products.objects.filter(
        #         category__in=user.entity.categories.all(), active=True).all()
        # return authorized_products
        queryset = Products.objects.all()
        # Look for a query parameter like ?entity_type=Grocery
        entity_type = user.entity.entity_type
        
        if entity_type:
            # Filters the array column against the query value
            queryset = queryset.filter(allowed_businesses__contains=[entity_type])
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


def update_product(data, user):
    product = None

    try:
        product_id = data["product"]
        if data["product"] == "":
            raise exceptions.ValidationError("Product ID must be valid UUID")
        if Products.objects.filter(id=product_id).exists():
            product = Products.objects.get(id=product_id)
            if user.is_staff:
                pass
            elif user == product.owner:
                pass
            else:
                raise exceptions.ValidationError("Not authorized")

    except KeyError:
        raise exceptions.ValidationError("Product ID is required")
    try:
        product_details = data["product_details"]
        if data["product_details"] == {}:
            raise exceptions.ValidationError(
                "No product details were supplied")
    except KeyError:
        raise exceptions.ValidationError(
            "Product details to update are required")

    title = None
    description = None
    manufacturer = None
    is_vatable = ""
    is_pom = ""
    active = ""
    category = ""
    sub_category = ""
    units_per_pack = ""
    packaging = ""

    if "title" in data["product_details"]:
        if data["product_details"]["title"]:
            title = data["product_details"]["title"]
    if "description" in data["product_details"]:
        if data["product_details"]["description"]:
            description = data["product_details"]["description"]

    if "manufacturer" in data["product_details"]:
        if data["product_details"]["manufacturer"]:
            manufacturer = data["product_details"]["manufacturer"]
    if "is_vatable" in data["product_details"]:
        if data["product_details"]["is_vatable"]:
            is_vatable = data["product_details"]["is_vatable"]

    if "is_pom" in data["product_details"]:
        if data["product_details"]["is_pom"]:
            is_pom = data["product_details"]["is_pom"]

    if "category" in data["product_details"]:
        if data["product_details"]["category"]:
            category = data["product_details"]["category"]

    if "sub_category" in data["product_details"]:
        if data["product_details"]["sub_category"]:
            sub_category = data["product_details"]["sub_category"]
    if "units_per_pack" in data["product_details"]:
        if data["product_details"]["units_per_pack"]:
            units_per_pack = data["product_details"]["units_per_pack"]
    if "packaging" in data["product_details"]:
        if data["product_details"]["packaging"]:
            packaging = data["product_details"]["packaging"]
    if "active" in data["product_details"]:
        if data["product_details"]["active"]:
            active = data["product_details"]["active"]

    try:

        if title:
            product.title = title
            product.save()
        if description:
            product.description = description
            product.save()
        if manufacturer:
            product.manufacturer = manufacturer
            product.save()
        if is_vatable:
            product.is_vatable = is_vatable
            product.save()
        if units_per_pack:
            product.units_per_pack = units_per_pack
            product.save()
        if packaging:
            product.packaging = packaging
            product.save()
        if active:
            product.active = active
            product.save()
        if is_pom and product.preparation != None:
            product.is_pom = is_pom
            product.save()
        if category:
            product.category = category
            product.save()
        if sub_category:
            product.sub_category = sub_category
            product.save()

        return product
    except Exception as e:
        raise exceptions.ValidationError(e)


@transaction.atomic
def update_product(data):

    if Products.objects.filter(id=data["id"]).exists():

        try:
            product = Products.objects.get(id=data["id"])
            if data["preparation"]:
                product.preparation_id = data["preparation"]
            else:
                product.preparation = None
                product.save()

            product.category_id = data.get("category", product.category_id)
            product.manufacturer_id = data.get(
                "manufacturer", product.manufacturer_id)
            product.title = data.get("title", product.title)
            product.description = data.get("description", product.description)
            product.is_pom = data.get("is_pom", product.is_pom)
            product.save()

            return product
        except:
            raise exceptions.ValidationError("Product not updated")


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
