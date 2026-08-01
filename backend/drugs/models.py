from django.db import models
from core.models import EntityRelatedModel
from django.contrib.auth import get_user_model
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _


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


class DrugClass(EntityRelatedModel):
    body_system = models.ForeignKey(BodySystem, on_delete=models.CASCADE)
    title = models.CharField(max_length=100)
    image = models.ImageField(
        upload_to="drug_class_image_upload", null=True, blank=True
    )
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(DrugClass, self).save(*args, **kwargs)

    def __str__(self):
        return self.title


class DrugSubClass(EntityRelatedModel):
    drug_class = models.ForeignKey(DrugClass, on_delete=models.CASCADE)
    title = models.CharField(max_length=100, unique=True)
    image = models.ImageField(
        upload_to="drug_subclass_image_upload", null=True, blank=True
    )
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(DrugSubClass, self).save(*args, **kwargs)

    def __str__(self):
        return self.title


class Generic(EntityRelatedModel):
    drug_class = models.ForeignKey(DrugClass, on_delete=models.CASCADE)
    drug_sub_class = models.ForeignKey(
        DrugSubClass, on_delete=models.CASCADE, null=True, blank=True
    )
    image = models.ImageField(upload_to="generic_images_upload", null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    title = models.CharField(max_length=240, blank=True, null=True)
    description = models.TextField(null=True, blank=True)
    synonym = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Generic, self).save(*args, **kwargs)

    class Meta:
        db_table = "generic"
        constraints = [
            models.UniqueConstraint(
                fields=["drug_class", "title"],
                name="No sharing of title within sub class",
            )
        ]


class Indications(EntityRelatedModel):
    generic = models.ForeignKey(Generic, on_delete=models.CASCADE)
    title = models.CharField(max_length=240, blank=True, null=True)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class Doses(EntityRelatedModel):
    generic = models.ForeignKey(Generic, on_delete=models.CASCADE)
    title = models.ForeignKey(Indications, on_delete=models.CASCADE)
    route = models.ForeignKey(Routes, on_delete=models.CASCADE)
    dose = models.TextField()
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class ModeOfActions(EntityRelatedModel):
    generic = models.ForeignKey(Generic, on_delete=models.CASCADE)
    mode_of_action = models.TextField()
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    class Meta:
        db_table = "mode_of_actions"
        constraints = [
            models.UniqueConstraint(
                fields=["generic", "mode_of_action"],
                name="No repetion entries per generic",
            )
        ]


class Contraindications(EntityRelatedModel):
    generic = models.ForeignKey(Generic, on_delete=models.CASCADE)
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
    generic = models.ForeignKey(
        Generic, related_name="generic_drug_interactions", on_delete=models.CASCADE
    )
    contra_indicated = models.ForeignKey(Generic, on_delete=models.CASCADE)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "interactions"
        constraints = [
            models.UniqueConstraint(
                fields=["generic", "contra_indicated"],
                name="Drug cannot be contraindicated with itself",
            )
        ]


class SideEffects(EntityRelatedModel):
    generic = models.ForeignKey(
        Generic, related_name="generic_side_effects", on_delete=models.CASCADE
    )
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
    generic = models.ForeignKey(
        Generic, related_name="generic_precautions", on_delete=models.CASCADE
    )
    title = models.TextField(max_length=200, unique=True)
    description = models.TextField(null=True, blank=True)
    owner = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Generic, self).save(*args, **kwargs)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.title = self.title.upper()
        super(Precautions, self).save(*args, **kwargs)


class SpecialConsiderations(EntityRelatedModel):
    generic = models.ForeignKey(
        Generic, related_name="generic_special_info", on_delete=models.CASCADE
    )
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
    generics = models.ManyToManyField(
        "Generic",
        related_name="preparations",
    )
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

    def get_generics(self):
        return ",".join([str(p) for p in self.generics.all()])
