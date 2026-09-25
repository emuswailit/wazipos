from django.contrib import admin
from . import models

# Register your models here.
admin.site.register(models.Category)
admin.site.register(models.DrugClass)
admin.site.register(models.DrugSubClass)



from django.contrib import admin
from django.core.exceptions import ValidationError
from django.db import transaction
from django.forms import ModelForm

# from .models import Generics


# class GenericsAdminForm(ModelForm):
#     class Meta:
#         model = Generics
#         fields = "__all__"

#     def clean(self):
#         cleaned = super().clean()
#         classes = cleaned.get("drug_class") or []
#         subclasses = cleaned.get("drug_sub_class") or []

#         class_ids = {c.id for c in classes}
#         subclass_parent_ids = {sc.drug_class_id for sc in subclasses}
#         missing = subclass_parent_ids - class_ids

#         if missing:
#             from .models import DrugClass
#             missing_titles = list(
#                 DrugClass.objects.filter(id__in=missing).values_list("title", flat=True)
#             )
#             raise ValidationError({
#                 "drug_class": (
#                     "Every subclass's parent class must also be selected. "
#                     f"Missing: {missing_titles}"
#                 )
#             })
#         return cleaned


# @admin.register(Generics)
# class GenericsAdmin(admin.ModelAdmin):
#     form = GenericsAdminForm

#     list_display = (
#         "title",
#         "owner",
#         "subclass_list",
#         "class_list",
#         "created",
#         "updated",
#     )
#     list_filter = ("drug_class", "drug_sub_class", "created")
#     search_fields = ("title", "description", "synonym")
#     readonly_fields = ("created", "updated")
#     filter_horizontal = ("drug_class", "drug_sub_class")
#     date_hierarchy = "created"
#     ordering = ("title",)

#     fieldsets = (
#         (None, {
#             "fields": ("title", "description", "synonym")
#         }),
#         ("Classification", {
#             "fields": ("drug_class", "drug_sub_class"),
#             "description": (
#                 "If you select a sub-class, its parent class must also "
#                 "be selected."
#             ),
#         }),
#         ("Meta", {
#             "fields": ("owner", "created", "updated"),
#             "classes": ("collapse",),
#         }),
#     )

#     @admin.display(description="Sub-classes")
#     def subclass_list(self, obj):
#         return ", ".join(obj.drug_sub_class.values_list("title", flat=True)) or "—"

#     @admin.display(description="Classes")
#     def class_list(self, obj):
#         return ", ".join(obj.drug_class.values_list("title", flat=True)) or "—"

#     def save_model(self, request, obj, form, change):
#         if not obj.owner_id:
#             obj.owner = request.user
#         super().save_model(request, obj, form, change)

#     def get_queryset(self, request):
#         return super().get_queryset(request).prefetch_related(
#             "drug_class", "drug_sub_class"
#         )




@admin.register(models.Formulations)
class FormulationsAdmin(admin.ModelAdmin):
    list_display = ('title', 'description',   )
    list_filter = ('title', )
    search_fields = ('title', )

    
@admin.register(models.Frequency)
class FrequenciesAdmin(admin.ModelAdmin):
    list_display = ('title', 'description',   )
    list_filter = ('title', )
    search_fields = ('title', )


@admin.register(models.Routes)
class RoutesAdmin(admin.ModelAdmin):
    list_display = ('title', 'description',   )
    list_filter = ('title', )
    search_fields = ('title', )


@admin.register(models.Preparation)
class PreparationsAdmin(admin.ModelAdmin):
    list_display = ('title', 'description',
                    'formulation',  )
    list_filter = ('title', )
    search_fields = ('title', )