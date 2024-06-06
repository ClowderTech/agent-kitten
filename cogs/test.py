import discord
from discord.ext import commands
import asyncio

class Test(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.stopping = {}

    @commands.has_guild_permissions(administrator=True)
    @commands.hybrid_command(name="spamping", description="do not use this", with_app_command=True)
    async def spamping(self, ctx: commands.Context, user: discord.User):
        self.stopping[user.id] = False
        while self.stopping[user.id] is False:
            await ctx.send(f"{user.mention}", allowed_mentions=discord.AllowedMentions.all())
            # await ctx.send(f"@everyone", allowed_mentions=discord.AllowedMentions.all())
            await asyncio.sleep(2)

    @commands.hybrid_command(name="stopspamping", description="use this if you use the sacred command", with_app_command=True)
    async def stopspamping(self, ctx: commands.Context, user: discord.User):
        self.stopping[user.id] = True

async def setup(bot):
    await bot.add_cog(Test(bot))