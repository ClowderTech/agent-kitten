import discord
from discord.ext import commands
import time
from platform import python_version


class Debug(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.start_time = time.time()

    @commands.hybrid_command(name="debug", description="Pulls any debug information", with_app_command=True)
    async def debug(self, ctx: commands.Context):
        embed = discord.Embed(title="Debug Information", color=0x00ff00)
        embed.add_field(name="Guilds", value=len(self.bot.guilds))
        embed.add_field(name="Users", value=len(self.bot.users))
        embed.add_field(name="Cogs", value=len(self.bot.cogs))
        embed.add_field(name="Shards", value=self.bot.shard_count)
        embed.add_field(name="Latency", value=f"{self.bot.latency * 1000:.2f}ms")
        embed.add_field(name="Uptime", value=f"{time.time() - self.start_time:.2f}s")
        embed.add_field(name="Python Version", value=python_version())
        embed.add_field(name="Library", value="discord.py")
        embed.add_field(name="Library Version", value=discord.__version__)
        await ctx.reply(embed=embed)


async def setup(bot):
    await bot.add_cog(Debug(bot))
