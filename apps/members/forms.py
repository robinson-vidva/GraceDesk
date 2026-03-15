from django import forms
from .models import Member, Household


class MemberForm(forms.ModelForm):
    class Meta:
        model = Member
        fields = [
            "first_name", "middle_name", "last_name",
            "email", "phone", "date_of_birth",
            "gender", "marital_status",
            "membership_date", "membership_status",
            "household", "household_role",
            "pastoral_notes",
        ]
        widgets = {
            "first_name": forms.TextInput(attrs={"class": "form-input"}),
            "middle_name": forms.TextInput(attrs={"class": "form-input"}),
            "last_name": forms.TextInput(attrs={"class": "form-input"}),
            "email": forms.EmailInput(attrs={"class": "form-input"}),
            "phone": forms.TextInput(attrs={"class": "form-input"}),
            "date_of_birth": forms.DateInput(attrs={"class": "form-input", "type": "date"}),
            "gender": forms.Select(attrs={"class": "form-input"}),
            "marital_status": forms.Select(attrs={"class": "form-input"}),
            "membership_date": forms.DateInput(attrs={"class": "form-input", "type": "date"}),
            "membership_status": forms.Select(attrs={"class": "form-input"}),
            "household": forms.Select(attrs={"class": "form-input"}),
            "household_role": forms.Select(attrs={"class": "form-input"}),
            "pastoral_notes": forms.Textarea(attrs={"class": "form-input", "rows": 3}),
        }

    def __init__(self, *args, tenant=None, **kwargs):
        super().__init__(*args, **kwargs)
        if tenant:
            self.fields["household"].queryset = Household.objects.filter(tenant=tenant)


class HouseholdForm(forms.ModelForm):
    class Meta:
        model = Household
        fields = [
            "family_name", "address_line1", "address_line2",
            "city", "state", "postal_code", "country", "home_phone",
        ]
        widgets = {
            "family_name": forms.TextInput(attrs={"class": "form-input"}),
            "address_line1": forms.TextInput(attrs={"class": "form-input"}),
            "address_line2": forms.TextInput(attrs={"class": "form-input"}),
            "city": forms.TextInput(attrs={"class": "form-input"}),
            "state": forms.TextInput(attrs={"class": "form-input"}),
            "postal_code": forms.TextInput(attrs={"class": "form-input"}),
            "country": forms.TextInput(attrs={"class": "form-input"}),
            "home_phone": forms.TextInput(attrs={"class": "form-input"}),
        }
