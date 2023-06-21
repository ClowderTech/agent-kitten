import discord
from discord.ext import commands
import os
import sys
import subprocess


class Utility(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.invite_link = "https://discord.com/api/oauth2/authorize?client_id=670009847307304980&permissions=117760&scope=applications.commands%20bot"
        self.support_server = "https://discord.gg/clowdertech"

    @commands.hybrid_command(name="invite", description="Gets the link for you to invite me to your server.", with_app_command=True)
    async def invite(self, ctx: commands.Context):
        await ctx.reply(f"Here is my invite link: {self.invite_link}")

    @commands.hybrid_command(name="support", description="Gets the link for my support server.", with_app_command=True)
    async def support(self, ctx: commands.Context):
        await ctx.reply(f"Here is my support server link: {self.support_server}")

    @commands.is_owner()
    @commands.hybrid_command(name="sync", description="Get all commands from the bot and update them. (Bot owner only)", with_app_command=True)
    async def sync(self, ctx: commands.Context):
        message = await ctx.reply("Syncing commands...", allowed_mentions=discord.AllowedMentions.none())
        await self.bot.tree.sync()
        await message.edit(content="Synced commands!", allowed_mentions=discord.AllowedMentions.none())
    
    @commands.is_owner()
    @commands.hybrid_command(name="restart", description="Restarts the bot. (Bot owner only)", with_app_command=True)
    async def restart(self, ctx: commands.Context):
        await ctx.reply("Restarting the bot. You will not get an update through this command.", allowed_mentions=discord.AllowedMentions.none())
        os.execv(sys.executable, ['python'] + sys.argv)

    @commands.is_owner()
    @commands.hybrid_command(name="shutdown", description="Stops the bot. (Bot owner only)", with_app_command=True)
    async def shutdown(self, ctx: commands.Context):
        await ctx.reply("Stopping the bot. Remember to boot it back up again sometime.", allowed_mentions=discord.AllowedMentions.none())
        exit(0)
        


async def setup(bot):
    await bot.add_cog(Utility(bot))
