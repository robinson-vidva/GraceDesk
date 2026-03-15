from django import forms
from django.utils import timezone

from .models import Donation, DonationBatch
from apps.members.models import Member


class DonationForm(forms.ModelForm):
    class Meta:
        model = Donation
        fields = [
            "member", "amount", "date", "type",
            "payment_method", "batch", "fiscal_year",
            "receipt_number", "is_anonymous", "notes",
        ]
        widgets = {
            "member": forms.Select(attrs={"class": "form-input"}),
            "amount": forms.NumberInput(attrs={"class": "form-input", "step": "0.01", "min": "0"}),
            "date": forms.DateInput(attrs={"class": "form-input", "type": "date"}),
            "type": forms.Select(attrs={"class": "form-input"}),
            "payment_method": forms.Select(attrs={"class": "form-input"}),
            "batch": forms.Select(attrs={"class": "form-input"}),
            "fiscal_year": forms.NumberInput(attrs={"class": "form-input"}),
            "receipt_number": forms.TextInput(attrs={"class": "form-input"}),
            "is_anonymous": forms.CheckboxInput(attrs={"class": "h-4 w-4 rounded border-gray-300 text-primary-600"}),
            "notes": forms.Textarea(attrs={"class": "form-input", "rows": 2}),
        }

    def __init__(self, *args, tenant=None, **kwargs):
        super().__init__(*args, **kwargs)
        if tenant:
            self.fields["member"].queryset = Member.objects.filter(
                tenant=tenant, deleted_at__isnull=True
            )
            self.fields["batch"].queryset = DonationBatch.objects.filter(tenant=tenant)
        self.fields["member"].required = False
        self.fields["batch"].required = False
        if not self.initial.get("fiscal_year"):
            self.initial["fiscal_year"] = timezone.now().year
        if not self.initial.get("date"):
            self.initial["date"] = timezone.now().date()


class DonationBatchForm(forms.ModelForm):
    class Meta:
        model = DonationBatch
        fields = ["batch_date", "description", "expected_total", "status"]
        widgets = {
            "batch_date": forms.DateInput(attrs={"class": "form-input", "type": "date"}),
            "description": forms.TextInput(attrs={"class": "form-input"}),
            "expected_total": forms.NumberInput(attrs={"class": "form-input", "step": "0.01"}),
            "status": forms.Select(attrs={"class": "form-input"}),
        }
