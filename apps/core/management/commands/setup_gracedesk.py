from django.core.management.base import BaseCommand
from apps.core.models import ChurchSettings
from apps.contributions.models import ContributionCategory
from apps.accounts.models import User
from apps.communications.models import BibleVerse


class Command(BaseCommand):
    help = "Set up GraceDesk with default settings, categories, and admin user"

    def handle(self, *args, **options):
        # Church settings
        settings, created = ChurchSettings.objects.get_or_create(pk=1)
        if created:
            self.stdout.write("Created default church settings")

        # Default categories
        default_categories = [
            ("Sunday Offering", 1),
            ("Monthly Tithe", 2),
            ("Special Offering", 3),
            ("Building Fund", 4),
            ("Missions", 5),
            ("Other", 6),
        ]
        for name, order in default_categories:
            cat, created = ContributionCategory.objects.get_or_create(
                name=name, defaults={"display_order": order}
            )
            if created:
                self.stdout.write(f"  Created category: {name}")

        # Default Bible verses
        default_verses = [
            ("2 Corinthians 9:7", "Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver."),
            ("Malachi 3:10", "Bring the whole tithe into the storehouse, that there may be food in my house. Test me in this, says the Lord Almighty."),
            ("Proverbs 3:9-10", "Honor the Lord with your wealth, with the firstfruits of all your crops; then your barns will be filled to overflowing."),
            ("Luke 6:38", "Give, and it will be given to you. A good measure, pressed down, shaken together and running over, will be poured into your lap."),
            ("Matthew 6:19-20", "Do not store up for yourselves treasures on earth... but store up for yourselves treasures in heaven."),
        ]
        for reference, text in default_verses:
            verse, created = BibleVerse.objects.get_or_create(
                reference=reference, defaults={"text": text}
            )
            if created:
                self.stdout.write(f"  Created bible verse: {reference}")

        # Default admin user
        if not User.objects.filter(email="admin@gracedesk.local").exists():
            user = User.objects.create_user(
                email="admin@gracedesk.local",
                password="changeme123",
                first_name="Admin",
                last_name="User",
                is_admin=True,
                can_manage_admins=True,
                is_active=True,
                is_staff=True,
                must_change_password=True,
            )
            self.stdout.write(self.style.SUCCESS(
                f"\nDefault admin created: admin@gracedesk.local / changeme123"
            ))
            self.stdout.write("  IMPORTANT: Login and change this password immediately!")
        else:
            self.stdout.write("Admin user already exists")

        self.stdout.write(self.style.SUCCESS("\nGraceDesk setup complete!"))
        self.stdout.write("Login at /login/ with admin@gracedesk.local / changeme123")
