from datetime import date

from django.test import TestCase, Client
from django.urls import reverse

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.members.models import Member
from .models import Donation, DonationBatch


class TestHelperMixin:
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Church", slug="test-church")
        self.other_tenant = Tenant.objects.create(name="Other Church", slug="other-church")
        self.user = User.objects.create_user(
            username="testuser", password="testpass123", tenant=self.tenant
        )
        self.no_tenant_user = User.objects.create_user(
            username="notenant", password="testpass123"
        )
        self.client = Client()
        self.client.login(username="testuser", password="testpass123")

    def make_member(self, tenant=None, **kwargs):
        defaults = {
            "tenant": tenant or self.tenant,
            "first_name": "John",
            "last_name": "Doe",
        }
        defaults.update(kwargs)
        return Member.objects.create(**defaults)

    def make_donation(self, tenant=None, member=None, **kwargs):
        if member is None:
            member = self.make_member(tenant=tenant)
        defaults = {
            "tenant": tenant or self.tenant,
            "member": member,
            "amount": "100.00",
            "date": date.today(),
            "type": "tithe",
            "payment_method": "cash",
            "fiscal_year": 2026,
        }
        defaults.update(kwargs)
        return Donation.objects.create(**defaults)

    def make_batch(self, tenant=None, **kwargs):
        defaults = {
            "tenant": tenant or self.tenant,
            "batch_date": date.today(),
            "created_by": self.user,
        }
        defaults.update(kwargs)
        return DonationBatch.objects.create(**defaults)


class DonationListTests(TestHelperMixin, TestCase):
    def test_list_donations(self):
        self.make_donation()
        resp = self.client.get(reverse("donations:list"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.context["total_count"], 1)

    def test_list_excludes_other_tenant(self):
        self.make_donation(tenant=self.other_tenant)
        resp = self.client.get(reverse("donations:list"))
        self.assertEqual(resp.context["total_count"], 0)

    def test_no_tenant_redirects(self):
        self.client.login(username="notenant", password="testpass123")
        resp = self.client.get(reverse("donations:list"))
        self.assertRedirects(resp, reverse("dashboard"))


class DonationCreateTests(TestHelperMixin, TestCase):
    def test_create_donation(self):
        member = self.make_member()
        data = {
            "member": member.pk,
            "amount": "50.00",
            "date": "2026-03-15",
            "type": "tithe",
            "payment_method": "cash",
            "fiscal_year": 2026,
        }
        resp = self.client.post(reverse("donations:create"), data)
        self.assertEqual(resp.status_code, 302)
        donation = Donation.objects.get(amount="50.00")
        self.assertEqual(donation.tenant, self.tenant)

    def test_create_no_tenant_blocked(self):
        self.client.login(username="notenant", password="testpass123")
        data = {
            "amount": "50.00",
            "date": "2026-03-15",
            "type": "tithe",
            "payment_method": "cash",
            "fiscal_year": 2026,
        }
        resp = self.client.post(reverse("donations:create"), data)
        self.assertRedirects(resp, reverse("dashboard"))


class DonationDetailTests(TestHelperMixin, TestCase):
    def test_detail(self):
        donation = self.make_donation()
        resp = self.client.get(reverse("donations:detail", args=[donation.pk]))
        self.assertEqual(resp.status_code, 200)

    def test_detail_other_tenant_404(self):
        donation = self.make_donation(tenant=self.other_tenant)
        resp = self.client.get(reverse("donations:detail", args=[donation.pk]))
        self.assertEqual(resp.status_code, 404)


class DonationEditTests(TestHelperMixin, TestCase):
    def test_edit_donation(self):
        donation = self.make_donation()
        data = {
            "member": donation.member.pk,
            "amount": "200.00",
            "date": "2026-03-15",
            "type": "offering",
            "payment_method": "check",
            "fiscal_year": 2026,
        }
        resp = self.client.post(reverse("donations:edit", args=[donation.pk]), data)
        self.assertEqual(resp.status_code, 302)
        donation.refresh_from_db()
        self.assertEqual(donation.amount, "200.00")

    def test_edit_other_tenant_404(self):
        donation = self.make_donation(tenant=self.other_tenant)
        resp = self.client.get(reverse("donations:edit", args=[donation.pk]))
        self.assertEqual(resp.status_code, 404)


class BatchListTests(TestHelperMixin, TestCase):
    def test_list(self):
        self.make_batch()
        resp = self.client.get(reverse("donations:batch_list"))
        self.assertEqual(resp.status_code, 200)

    def test_no_tenant_redirects(self):
        self.client.login(username="notenant", password="testpass123")
        resp = self.client.get(reverse("donations:batch_list"))
        self.assertRedirects(resp, reverse("dashboard"))


class BatchCreateTests(TestHelperMixin, TestCase):
    def test_create_batch(self):
        data = {
            "batch_date": "2026-03-15",
            "description": "Sunday collection",
            "expected_total": "500.00",
            "status": "open",
        }
        resp = self.client.post(reverse("donations:batch_create"), data)
        self.assertEqual(resp.status_code, 302)
        batch = DonationBatch.objects.get(description="Sunday collection")
        self.assertEqual(batch.tenant, self.tenant)
        self.assertEqual(batch.created_by, self.user)


class BatchDetailTests(TestHelperMixin, TestCase):
    def test_detail(self):
        batch = self.make_batch()
        resp = self.client.get(reverse("donations:batch_detail", args=[batch.pk]))
        self.assertEqual(resp.status_code, 200)

    def test_detail_other_tenant_404(self):
        batch = self.make_batch(tenant=self.other_tenant)
        resp = self.client.get(reverse("donations:batch_detail", args=[batch.pk]))
        self.assertEqual(resp.status_code, 404)
