from django.db import models
from core.models import EntityRelatedModel
from django.contrib.auth import get_user_model
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _
from django.db.models import UniqueConstraint
from django.db.models.functions import Lower


Users = get_user_model()


class Routes(EntityRelatedModel):
    title = models.CharField(max_length=100, unique=True)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Routes, self).save(*args, **kwargs)


class Frequency(EntityRelatedModel):
    title = models.CharField(max_length=100, unique=True)
    latin = models.CharField(max_length=100, null=True, blank=True)
    abbreviation = models.CharField(max_length=10, null=True, blank=True)
    numerical = models.IntegerField(default=0)
    image = models.ImageField(
        upload_to="frequency_images_upload", null=True, blank=True
    )
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)
    description = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural="Frequencies"

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Frequency, self).save(*args, **kwargs)


class Instruction(EntityRelatedModel):
    title = models.CharField(max_length=100)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Instruction, self).save(*args, **kwargs)


class BodySystemImages(EntityRelatedModel):
    system = models.ForeignKey(
        "BodySystem", on_delete=models.CASCADE, null=True, blank=True
    )
    image = models.ImageField(upload_to="body_system_images")
    owner = models.ForeignKey(Users, on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class BodySystem(EntityRelatedModel):
    title = models.CharField(max_length=100, unique=True)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    images = models.ManyToManyField(
        BodySystemImages,
        related_name="images",
        blank=True,
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(BodySystem, self).save(*args, **kwargs)

    def __str__(self):
        return self.title


from django.db import models
from django.db.models import UniqueConstraint
from django.db.models.functions import Lower
from django.core.exceptions import ValidationError
from  core.models import EntityRelatedModel   # adjust import to wherever yours lives
from authentication.models import Users          # adjust import


class DrugClass(EntityRelatedModel):
    title = models.CharField(max_length=360)
    image = models.ImageField(
        upload_to="drug_class_image_upload",
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="drug_classes",
    )
    description = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "drug_classes"
        verbose_name = "Drug Class"
        verbose_name_plural = "Drug Classes"
        ordering = ["title"]
        constraints = [
            UniqueConstraint(
                Lower("title"),
                name="drug_classes_unique_title_ci",
            ),
        ]

    def __str__(self):
        return self.title or f"DrugClass #{self.pk}"

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.strip().upper()
        super().save(*args, **kwargs)


class DrugSubClass(EntityRelatedModel):
    drug_class = models.ForeignKey(
        DrugClass,
        on_delete=models.CASCADE,
        related_name="subclasses",
    )
    title = models.CharField(max_length=360)
    image = models.ImageField(
        upload_to="drug_subclass_image_upload",
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        Users,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="drug_sub_classes",
    )
    description = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "drug_sub_classes"
        verbose_name = "Drug Sub-Class"
        verbose_name_plural = "Drug Sub-Classes"
        ordering = ["drug_class__title", "title"]
        constraints = [
            # Unique per parent class, case-insensitive.
            # Drop this and use `unique=True` on title if you want
            # subclasses to be globally unique.
            UniqueConstraint(
                Lower("title"),
                "drug_class",
                name="drug_sub_classes_unique_title_per_class_ci",
            ),
        ]

    def __str__(self):
        return f"{self.drug_class.title} → {self.title}" if self.drug_class_id else self.title

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.strip().upper()
        super().save(*args, **kwargs)




# class Generics(EntityRelatedModel):
#     drug_class = models.ManyToManyField(
#         DrugClass,
#         related_name="generics",
#         blank=True,
#         help_text="Classes this generic belongs to.",
#     )
#     drug_sub_class = models.ManyToManyField(
#         DrugSubClass,
#         related_name="generics",
#         blank=True,
#         help_text="Sub-classes this generic belongs to.",
#     )

#     owner = models.ForeignKey(
#         Users,
#         on_delete=models.SET_NULL,
#         null=True,
#         blank=True,
#         related_name="generics",
#     )

#     title = models.CharField(max_length=360, blank=True, null=True)
#     description = models.TextField(null=True, blank=True)
#     synonym = models.TextField(null=True, blank=True)
#     created = models.DateTimeField(auto_now_add=True)
#     updated = models.DateTimeField(auto_now=True)

#     class Meta:
#         db_table = "generics"
#         verbose_name = "Generics"
#         verbose_name_plural = "Generics"
#         ordering = ["title"]
#         constraints = [
#             UniqueConstraint(Lower("title"), name="generics_unique_title_ci"),
#         ]

#     def __str__(self):
#         return self.title or f"Generics #{self.pk}"

#     def save(self, *args, **kwargs):
#         if self.title:
#             self.title = self.title.strip().upper()
#         super().save(*args, **kwargs)

#     def clean(self):
#         """
#         Enforce: every subclass's parent class must also be selected.
#         Note: M2M relations can't be checked before the row has a pk,
#         so this only runs meaningfully on updates. Real enforcement
#         happens in the serializer for create/update.
#         """
#         super().clean()
#         if not self.pk:
#             return
#         self._check_class_subclass_invariant(
#             class_ids=set(self.drug_class.values_list("id", flat=True)),
#             subclass_parent_ids=set(
#                 self.drug_sub_class.values_list("drug_class_id", flat=True)
#             ),
#         )

#     @staticmethod
#     def _check_class_subclass_invariant(class_ids, subclass_parent_ids):
#         missing = subclass_parent_ids - class_ids
#         if missing:
#             missing_titles = list(
#                 DrugClass.objects.filter(id__in=missing).values_list("title", flat=True)
#             )
#             raise ValidationError({
#                 "drug_class": (
#                     "Every subclass's parent class must also be selected. "
#                     f"Missing: {missing_titles}"
#                 )
#             })
        
class Indications(EntityRelatedModel):
    # generic = models.ForeignKey(Generic, on_delete=models.CASCADE)
    title = models.CharField(max_length=360, blank=True, null=True)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class Doses(EntityRelatedModel):
    # generic = models.ForeignKey(Generic, on_delete=models.CASCADE)
    title = models.ForeignKey(Indications, on_delete=models.CASCADE)
    route = models.ForeignKey(Routes, on_delete=models.CASCADE)
    dose = models.TextField()
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class ModeOfActions(EntityRelatedModel):
    # generic = models.ForeignKey(Generic, on_delete=models.CASCADE)
    mode_of_action = models.TextField()
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    # class Meta:
    #     db_table = "mode_of_actions"
    #     constraints = [
    #         models.UniqueConstraint(
    #             fields=["generic", "mode_of_action"],
    #             name="No repetion entries per generic",
    #         )
    #     ]


class Contraindications(EntityRelatedModel):
    # generic = models.ForeignKey(Generic, on_delete=models.CASCADE)
    title = models.TextField(max_length=200)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Contraindications, self).save(*args, **kwargs)


class Interactions(EntityRelatedModel):
    # generic = models.ForeignKey(
    #     Generic, related_name="generic_drug_interactions", on_delete=models.CASCADE
    # )
    # contra_indicated = models.ForeignKey(Generics, on_delete=models.CASCADE)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    # class Meta:
    #     db_table = "interactions"
    #     constraints = [
    #         models.UniqueConstraint(
    #             fields=["generic", "contra_indicated"],
    #             name="Drug cannot be contraindicated with itself",
    #         )
    #     ]


class SideEffects(EntityRelatedModel):
    # generic = models.ForeignKey(
    #     Generic, related_name="generic_side_effects", on_delete=models.CASCADE
    # )
    title = models.TextField(max_length=200)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(SideEffects, self).save(*args, **kwargs)


class Precautions(EntityRelatedModel):
    # generic = models.ForeignKey(
    #     Generic, related_name="generic_precautions", on_delete=models.CASCADE
    # )
    title = models.TextField(max_length=200, unique=True)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Precautions, self).save(*args, **kwargs)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Precautions, self).save(*args, **kwargs)


class SpecialConsiderations(EntityRelatedModel):
    # generic = models.ForeignKey(
    #     Generic, related_name="generic_special_info", on_delete=models.CASCADE
    # )
    title = models.TextField(max_length=200)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(SpecialConsiderations, self).save(*args, **kwargs)


class Formulations(EntityRelatedModel):
    title = models.CharField(max_length=100, unique=True)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Formulations"

    def clean(self):
        self.title = self.title.upper()

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Formulations, self).save(*args, **kwargs)


class Preparation(EntityRelatedModel):
    title = models.CharField(max_length=240, unique=True)
    # generics = models.ManyToManyField(
    #     "Generic",
    #     related_name="preparations",
    # )
    formulation = models.ForeignKey(Formulations, on_delete=models.CASCADE)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    class Meta:
        verbose_name_plural = "Preparations"

    def __str__(self):
        return f"{self.title} - {self.formulation}"

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Preparation, self).save(*args, **kwargs)

    # def get_generics(self):
    #     return ",".join([str(p) for p in self.generics.all()])
