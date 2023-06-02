import discord
from discord.ext import commands


class Utility(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.invite_link = "https://canary.discord.com/api/oauth2/authorize?client_id=670009847307304980&permissions=117760&scope=applications.commands%20bot"
        self.support_server = "https://discord.gg/clowdertech"

    @commands.hybrid_command(name="invite", description="Gets the link for you to invite me to your server.", with_app_command=True)
    async def invite(self, ctx: commands.Context):
        await ctx.reply(f"Here is my invite link: {self.invite_link}")

    @commands.hybrid_command(name="support", description="Gets the link for my support server.", with_app_command=True)
    async def invite(self, ctx: commands.Context):
        await ctx.reply(f"Here is my support server link: {self.support_server}")


async def setup(bot):
    await bot.add_cog(Utility(bot))
