from django.test import TestCase, Client
from django.urls import reverse

from apps.accounts.models import User
from apps.core.models import Tenant
from .models import Member, Household


class TestHelperMixin:
    """Shared helpers for creating test data."""

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Church", slug="test-church")
        self.other_tenant = Tenant.objects.create(name="Other Church", slug="other-church")
        self.user = User.objects.create_user(
            username="testuser", password="testpass123", tenant=self.tenant
        )
        self.other_user = User.objects.create_user(
            username="otheruser", password="testpass123", tenant=self.other_tenant
        )
        self.no_tenant_user = User.objects.create_user(
            username="notenant", password="testpass123"
        )
        self.client = Client()
        self.client.login(username="testuser", password="testpass123")

    def make_household(self, tenant=None, **kwargs):
        defaults = {"family_name": "Smith", "tenant": tenant or self.tenant}
        defaults.update(kwargs)
        return Household.objects.create(**defaults)

    def make_member(self, tenant=None, **kwargs):
        defaults = {
            "tenant": tenant or self.tenant,
            "first_name": "John",
            "last_name": "Doe",
        }
        defaults.update(kwargs)
        return Member.objects.create(**defaults)


# ── Member CRUD Tests ────────────────────────────────────────────────


class MemberListTests(TestHelperMixin, TestCase):
    def test_list_members(self):
        self.make_member()
        resp = self.client.get(reverse("members:list"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.context["total_count"], 1)

    def test_list_excludes_other_tenant(self):
        self.make_member(tenant=self.other_tenant, first_name="Other")
        resp = self.client.get(reverse("members:list"))
        self.assertEqual(resp.context["total_count"], 0)

    def test_list_excludes_soft_deleted(self):
        from django.utils import timezone
        self.make_member(deleted_at=timezone.now())
        resp = self.client.get(reverse("members:list"))
        self.assertEqual(resp.context["total_count"], 0)

    def test_search_by_name(self):
        self.make_member(first_name="Alice", last_name="Wonder")
        self.make_member(first_name="Bob", last_name="Builder")
        resp = self.client.get(reverse("members:list") + "?q=Alice")
        self.assertEqual(resp.context["total_count"], 1)

    def test_filter_by_status(self):
        self.make_member(membership_status="active")
        self.make_member(membership_status="inactive")
        resp = self.client.get(reverse("members:list") + "?status=active")
        self.assertEqual(resp.context["total_count"], 1)

    def test_unauthenticated_redirects(self):
        self.client.logout()
        resp = self.client.get(reverse("members:list"))
        self.assertEqual(resp.status_code, 302)
        self.assertIn("/accounts/login/", resp.url)

    def test_no_tenant_redirects_to_dashboard(self):
        self.client.login(username="notenant", password="testpass123")
        resp = self.client.get(reverse("members:list"))
        self.assertRedirects(resp, reverse("dashboard"))


class MemberCreateTests(TestHelperMixin, TestCase):
    def test_create_member_get(self):
        resp = self.client.get(reverse("members:create"))
        self.assertEqual(resp.status_code, 200)

    def test_create_member_post(self):
        data = {
            "first_name": "Jane",
            "last_name": "Smith",
            "membership_status": "active",
        }
        resp = self.client.post(reverse("members:create"), data)
        self.assertEqual(resp.status_code, 302)
        member = Member.objects.get(first_name="Jane")
        self.assertEqual(member.tenant, self.tenant)

    def test_create_assigns_tenant_automatically(self):
        data = {
            "first_name": "Auto",
            "last_name": "Tenant",
            "membership_status": "active",
        }
        self.client.post(reverse("members:create"), data)
        member = Member.objects.get(first_name="Auto")
        self.assertEqual(member.tenant_id, self.tenant.id)

    def test_create_no_tenant_blocked(self):
        self.client.login(username="notenant", password="testpass123")
        data = {"first_name": "Bad", "last_name": "Actor", "membership_status": "active"}
        resp = self.client.post(reverse("members:create"), data)
        self.assertRedirects(resp, reverse("dashboard"))
        self.assertFalse(Member.objects.filter(first_name="Bad").exists())


class MemberDetailTests(TestHelperMixin, TestCase):
    def test_detail_view(self):
        member = self.make_member()
        resp = self.client.get(reverse("members:detail", args=[member.pk]))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.context["member"], member)

    def test_detail_other_tenant_404(self):
        member = self.make_member(tenant=self.other_tenant)
        resp = self.client.get(reverse("members:detail", args=[member.pk]))
        self.assertEqual(resp.status_code, 404)

    def test_detail_soft_deleted_404(self):
        from django.utils import timezone
        member = self.make_member(deleted_at=timezone.now())
        resp = self.client.get(reverse("members:detail", args=[member.pk]))
        self.assertEqual(resp.status_code, 404)


class MemberEditTests(TestHelperMixin, TestCase):
    def test_edit_member(self):
        member = self.make_member()
        data = {
            "first_name": "Updated",
            "last_name": "Name",
            "membership_status": "active",
        }
        resp = self.client.post(reverse("members:edit", args=[member.pk]), data)
        self.assertEqual(resp.status_code, 302)
        member.refresh_from_db()
        self.assertEqual(member.first_name, "Updated")

    def test_edit_other_tenant_404(self):
        member = self.make_member(tenant=self.other_tenant)
        resp = self.client.get(reverse("members:edit", args=[member.pk]))
        self.assertEqual(resp.status_code, 404)


class MemberDeleteTests(TestHelperMixin, TestCase):
    def test_soft_delete(self):
        member = self.make_member()
        resp = self.client.post(reverse("members:delete", args=[member.pk]))
        self.assertRedirects(resp, reverse("members:list"))
        member.refresh_from_db()
        self.assertIsNotNone(member.deleted_at)

    def test_delete_other_tenant_404(self):
        member = self.make_member(tenant=self.other_tenant)
        resp = self.client.post(reverse("members:delete", args=[member.pk]))
        self.assertEqual(resp.status_code, 404)


# ── Household CRUD Tests ─────────────────────────────────────────────


class HouseholdListTests(TestHelperMixin, TestCase):
    def test_list_households(self):
        self.make_household()
        resp = self.client.get(reverse("households:list"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.context["total_count"], 1)

    def test_list_excludes_other_tenant(self):
        self.make_household(tenant=self.other_tenant)
        resp = self.client.get(reverse("households:list"))
        self.assertEqual(resp.context["total_count"], 0)

    def test_search(self):
        self.make_household(family_name="Johnson")
        self.make_household(family_name="Williams")
        resp = self.client.get(reverse("households:list") + "?q=John")
        self.assertEqual(resp.context["total_count"], 1)

    def test_no_tenant_redirects(self):
        self.client.login(username="notenant", password="testpass123")
        resp = self.client.get(reverse("households:list"))
        self.assertRedirects(resp, reverse("dashboard"))


class HouseholdCreateTests(TestHelperMixin, TestCase):
    def test_create_household(self):
        data = {
            "family_name": "New Family",
            "address_line1": "123 Main St",
            "city": "Springfield",
            "state": "IL",
            "postal_code": "62701",
            "country": "US",
        }
        resp = self.client.post(reverse("households:create"), data)
        self.assertEqual(resp.status_code, 302)
        household = Household.objects.get(family_name="New Family")
        self.assertEqual(household.tenant, self.tenant)

    def test_create_no_tenant_blocked(self):
        self.client.login(username="notenant", password="testpass123")
        data = {"family_name": "Bad Family"}
        resp = self.client.post(reverse("households:create"), data)
        self.assertRedirects(resp, reverse("dashboard"))
        self.assertFalse(Household.objects.filter(family_name="Bad Family").exists())


class HouseholdDetailTests(TestHelperMixin, TestCase):
    def test_detail(self):
        household = self.make_household()
        resp = self.client.get(reverse("households:detail", args=[household.pk]))
        self.assertEqual(resp.status_code, 200)

    def test_detail_other_tenant_404(self):
        household = self.make_household(tenant=self.other_tenant)
        resp = self.client.get(reverse("households:detail", args=[household.pk]))
        self.assertEqual(resp.status_code, 404)


class HouseholdEditTests(TestHelperMixin, TestCase):
    def test_edit_household(self):
        household = self.make_household()
        data = {"family_name": "Updated Family", "country": "US"}
        resp = self.client.post(reverse("households:edit", args=[household.pk]), data)
        self.assertEqual(resp.status_code, 302)
        household.refresh_from_db()
        self.assertEqual(household.family_name, "Updated Family")

    def test_edit_other_tenant_404(self):
        household = self.make_household(tenant=self.other_tenant)
        resp = self.client.get(reverse("households:edit", args=[household.pk]))
        self.assertEqual(resp.status_code, 404)


class HouseholdDeleteTests(TestHelperMixin, TestCase):
    def test_delete_household(self):
        household = self.make_household()
        resp = self.client.post(reverse("households:delete", args=[household.pk]))
        self.assertRedirects(resp, reverse("households:list"))
        self.assertFalse(Household.objects.filter(pk=household.pk).exists())

    def test_delete_other_tenant_404(self):
        household = self.make_household(tenant=self.other_tenant)
        resp = self.client.post(reverse("households:delete", args=[household.pk]))
        self.assertEqual(resp.status_code, 404)
