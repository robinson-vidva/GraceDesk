from django.test import TestCase, Client
from django.urls import reverse

from apps.accounts.models import User
from apps.core.models import Tenant


class LoginTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Church", slug="test-church")
        self.user = User.objects.create_user(
            username="testuser", password="testpass123", tenant=self.tenant
        )
        self.client = Client()

    def test_login_page_loads(self):
        resp = self.client.get(reverse("accounts:login"))
        self.assertEqual(resp.status_code, 200)

    def test_login_success(self):
        resp = self.client.post(reverse("accounts:login"), {
            "username": "testuser",
            "password": "testpass123",
        })
        self.assertRedirects(resp, reverse("dashboard"))

    def test_login_bad_password(self):
        resp = self.client.post(reverse("accounts:login"), {
            "username": "testuser",
            "password": "wrong",
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.context["form"].errors)

    def test_login_redirect_next(self):
        resp = self.client.post(
            reverse("accounts:login") + "?next=/members/",
            {"username": "testuser", "password": "testpass123"},
        )
        self.assertRedirects(resp, "/members/", fetch_redirect_response=False)

    def test_authenticated_user_redirected(self):
        self.client.login(username="testuser", password="testpass123")
        resp = self.client.get(reverse("accounts:login"))
        self.assertRedirects(resp, reverse("dashboard"))


class LogoutTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Church", slug="test-church")
        self.user = User.objects.create_user(
            username="testuser", password="testpass123", tenant=self.tenant
        )
        self.client = Client()
        self.client.login(username="testuser", password="testpass123")

    def test_logout(self):
        resp = self.client.get(reverse("accounts:logout"))
        self.assertRedirects(resp, reverse("accounts:login"))
        # Verify actually logged out
        resp = self.client.get(reverse("dashboard"))
        self.assertEqual(resp.status_code, 302)


class PasswordChangeTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Church", slug="test-church")
        self.user = User.objects.create_user(
            username="testuser", password="testpass123", tenant=self.tenant
        )
        self.client = Client()
        self.client.login(username="testuser", password="testpass123")

    def test_password_change_page_loads(self):
        resp = self.client.get(reverse("accounts:password_change"))
        self.assertEqual(resp.status_code, 200)

    def test_password_change_success(self):
        resp = self.client.post(reverse("accounts:password_change"), {
            "old_password": "testpass123",
            "new_password1": "newSecurePass456!",
            "new_password2": "newSecurePass456!",
        })
        self.assertRedirects(resp, reverse("dashboard"), fetch_redirect_response=False)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newSecurePass456!"))

    def test_password_change_requires_auth(self):
        self.client.logout()
        resp = self.client.get(reverse("accounts:password_change"))
        self.assertEqual(resp.status_code, 302)
        self.assertIn("/accounts/login/", resp.url)
