import discord
from discord.ext import commands
import os
import sys
import subprocess
import asyncio
import codecs
import time
from contextlib import redirect_stdout
import pprint
import datetime

async def is_dev(ctx):
    guild = ctx.bot.get_guild(748736032563920929)
    member = guild.get_member(ctx.author.id)
    if member is None:
        return False
    roles = [guild.get_role(977371064864768040), guild.get_role(1106801021335908372)]
    if any(role in member.roles for role in roles):
        return True
    return False

class Utility(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.invite_link = "https://discord.com/api/oauth2/authorize?client_id=736086853932941423&permissions=416615353408&scope=bot%20applications.commands"
        self.support_server = "https://discord.gg/clowdertech"

    @commands.hybrid_command(name="invite", description="Gets the link for you to invite me to your server.", with_app_command=True)
    async def invite(self, ctx: commands.Context):
        await ctx.reply(f"Here is my invite link: {self.invite_link}")

    @commands.hybrid_command(name="support", description="Gets the link for my support server.", with_app_command=True)
    async def support(self, ctx: commands.Context):
        await ctx.reply(f"Here is my support server link: {self.support_server}")

    @commands.check(is_dev)
    @commands.hybrid_command(name="sync", description="Get all commands from the bot and update them. (Bot dev only)", with_app_command=True)
    async def sync(self, ctx: commands.Context):
        message = await ctx.reply("Syncing commands...", allowed_mentions=discord.AllowedMentions.none())
        await self.bot.tree.sync()
        await message.edit(content="Synced commands!", allowed_mentions=discord.AllowedMentions.none())
    
    @commands.check(is_dev)
    @commands.hybrid_command(name="restart", description="Restarts the bot. (Bot dev only)", with_app_command=True)
    async def restart(self, ctx: commands.Context):
        await ctx.reply("Restarting the bot. You will not get an update through this command.", allowed_mentions=discord.AllowedMentions.none())
        os.execv(sys.executable, ['python'] + sys.argv)

    @commands.check(is_dev)
    @commands.hybrid_command(name="shutdown", description="Stops the bot. (Bot dev only)", with_app_command=True)
    async def shutdown(self, ctx: commands.Context):
        await ctx.reply("Stopping the bot. Remember to boot it back up again sometime.", allowed_mentions=discord.AllowedMentions.none())
        exit(0)

    @commands.check(is_dev)
    @commands.hybrid_command(name="eval", description="Compiles and executes python and discord.py code (Bot dev only)", with_app_command=True)
    async def eval(self, ctx: commands.Context, *, code: str):
        message = await ctx.reply("Code executing...", allowed_mentions=discord.AllowedMentions.none())
        amount = 1
        for line in code.split(r"\n"):
            if "while True:" in line.strip():
                raise commands.errors.BadArgument("Code cannot contain a while True loop.")
            if not line.strip().startswith("for"):
                continue
            amount *= int(line.strip().split(" ")[-1].removesuffix("):").removeprefix("range("))
            if amount > 50:
                raise commands.errors.BadArgument("Code cannot contain a for loop thats more than 50 iterations.")

        new_code = f"async def __ex(bot, ctx):\n\twith open(\"eval_output.txt\", \"w\") as file:\n\t\twith redirect_stdout(file):\n\t\t\t" + "".join([f"\n\t\t\t{line}" for line in code.split(r"\n")])
        compiled = compile(new_code, "<string>", "exec")
        exec(compiled, globals(), locals())

        await locals()["__ex"](self.bot, ctx)
        
        with open("eval_output.txt", "r") as file:
            output = file.read()
            if len(output) > 1900:
                output = f"{output[1900]}..."
            elif len(output) == 0:
                output = "No output."

        await message.edit(content=f"Code executed!\n\nOutput: ```{output}```", allowed_mentions=discord.AllowedMentions.none())
        


async def setup(bot):
    await bot.add_cog(Utility(bot))
