from django.contrib import admin
from . import models

# Register your models here.
admin.site.register(models.BodySystem)
admin.site.register(models.DrugClass)
admin.site.register(models.DrugSubClass)



@admin.register(models.Generic)
class GenericsAdmin(admin.ModelAdmin):
    list_display = ('title', 'description', 'drug_class',
                    'drug_sub_class',  )
    list_filter = ('title', )
    search_fields = ('title', )

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
    list_display = ('title', 'description', 'get_generics',
                    'formulation',  )
    list_filter = ('title', )
    search_fields = ('title', )