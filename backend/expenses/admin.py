from django.contrib import admin
from . import models

# # Register your models here.
@admin.register(models.WishLists)
class WishListsAdmin(admin.ModelAdmin):
    list_display = (
       "title", "limit_amount", "owner", "expiry_date",
       "description", "created", "updated"
    
    )
    list_filter = (
        "title", "owner", "expiry_date", "created", "updated"
    )
    search_fields = ("title",)
@admin.register(models.WishListProducts)
class WishListProductsAdmin(admin.ModelAdmin):
    list_display = (
       "product", "wishlist", "owner", "quantity",
        "created", "updated"
    
    )
    list_filter = (
        "wishlist", "owner", "created", "updated"
    )

@admin.register(models.EntityExpense)
class EntityExpensesAdmin(admin.ModelAdmin):
    list_display = (
       "draft_id","expense_category", "amount", 
       "description", "created", "updated"
    
    )
 



@admin.register(models.EntityExpenseCategories)
class EntityExpenseCategoriesAdmin(admin.ModelAdmin):
    list_display = (
       "title", "description", 
       "created", "updated"     
    )
    list_filter = (
        "title",  
    )
    search_fields = ("title",)





   