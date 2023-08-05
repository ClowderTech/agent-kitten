import discord
from discord.ext import tasks, commands
import math
import random
import asyncio
import typing


def calculate_level(level, experience):
    return (3 * (level ** 2) + (20 * level) + 100) - experience


def calculate_experience_gain():
    return abs(math.floor(math.sqrt(math.ceil(random.random() * 196 + 1))) - 15)


async def is_dev(ctx):
    guild = ctx.bot.get_guild(748736032563920929)
    member = guild.get_member(ctx.author.id)
    if member is None:
        return False
    roles = [guild.get_role(977371064864768040), guild.get_role(1106801021335908372)]
    if any(role in member.roles for role in roles):
        return True
    return False


class Leveling(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.collection = self.bot.database["leveling"]
        self.text_user_talked = []
        self.voice_user_talked = []
        self.bg_task = self.bot.loop.create_task(self.talking_reset())
        self.bg_task2 = self.bot.loop.create_task(self.check_voice_talking())

    async def process_xp_gain(self, user: discord.User, points: int = None):
        if points is None:
            points = calculate_experience_gain()

        key = {
            "user-id": str(user.id)
        }

        user_data = await self.collection.find_one(key)

        if user_data:
            level = user_data["level"]
            experience = user_data["experience"]
            new_experience = experience + points
            new_level = level
            while new_experience >= calculate_level(new_level, 0):
                new_experience -= calculate_level(new_level, 0)
                new_level += 1
            if new_level > level:
                try:
                    await user.send(f"Congratulations, {user.mention}! You are now level {new_level}!", allowed_mentions=discord.AllowedMentions.none(), silent=True)
                except discord.Forbidden:
                    pass
            data = {
                "$set": {
                    "level": new_level,
                    "experience": new_experience
                }
            }
            await self.collection.update_one(key, data)
        else:
            level = 0
            experience = 0
            new_experience = experience + points
            new_level = level
            while new_experience >= calculate_level(new_level, 0):
                new_experience -= calculate_level(new_level, 0)
                new_level += 1
            if new_level > level:
                try:
                    await user.send(f"Congratulations, {user.mention}! You are now level {new_level}!", allowed_mentions=discord.AllowedMentions.none(), silent=True)
                except discord.Forbidden:
                    pass

            data = {
                "user-id": str(user.id),
                "level": new_level,
                "experience": new_experience
            }
            await self.collection.insert_one(data)

    async def process_xp_set(self, user: discord.User, level: int = None, experience: int = None):
        key = {
            "user-id": str(user.id)
        }

        user_data = await self.collection.find_one(key)

        if user_data:
            if level is None:
                level = user_data["level"]
            if experience is None:
                experience = user_data["experience"]

            data = {
                "$set": {
                    "level": level,
                    "experience": experience
                }
            }
            await self.collection.update_one(key, data)
        else:
            data = {
                "user-id": str(user.id),
                "level": level,
                "experience": experience
            }
            await self.collection.insert_one(data)

        try:
            await user.send(f"Hello, {user.mention}! A bot developer has set your level to {level} and experience to {experience}!", allowed_mentions=discord.AllowedMentions.none(), silent=True)
        except discord.Forbidden:
            pass
            

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot:
            return
        elif message.author.id not in self.text_user_talked:
            self.text_user_talked.append(message.author.id)
            await self.process_xp_gain(message.author)

    async def talking_reset(self):
        await self.bot.wait_until_ready()
        while not self.bot.is_closed():
            await asyncio.sleep(60)
            self.text_user_talked = []
            self.voice_user_talked = []

    async def check_voice_talking(self):
        await self.bot.wait_until_ready()
        while not self.bot.is_closed():
            members = list(self.bot.get_all_members())
            wait_time = 60 / len(members)
            for member in members:
                await asyncio.sleep(wait_time)
                if not member.voice:
                    continue
                elif member.voice.self_mute or member.voice.self_deaf:
                    continue
                elif member.voice.afk:
                    continue
                elif member.voice.mute or member.voice.deaf:
                    continue
                elif member.bot:
                    continue
                elif member.id not in self.voice_user_talked:
                    self.voice_user_talked.append(member.id)
                    await self.process_xp_gain(member)

    @commands.hybrid_command(name="level", description="Pulls your level and experience.", with_app_command=True)
    async def level(self, ctx: commands.Context, member_to_check: typing.Optional[discord.User]):
        if member_to_check is None:
            member_to_check = ctx.author
        else:
            member_to_check = member_to_check
        key = {
            "user-id": str(member_to_check.id)
        }
        user_data = await self.collection.find_one(key)
        if user_data:
            level = user_data["level"]
            experience = user_data["experience"]
            await ctx.reply(f"{member_to_check.mention} is level {level} with {experience} experience. They need {calculate_level(level, experience)} more experience points to level up.", allowed_mentions=discord.AllowedMentions.none())
        else:
            await ctx.reply(f"{member_to_check.mention} does not have any data.", allowed_mentions=discord.AllowedMentions.none())

    @commands.hybrid_command(name="leaderboard", description="Pulls the top 10 users with the most experience.", with_app_command=True)
    async def leaderboard(self, ctx: commands.Context):
        users = self.collection.find().sort(
            [("level", -1), ("experience", -1)])
        embed = discord.Embed(title="Leaderboard",
                              color=discord.Color.blurple())
        i = 1
        async for user in users:
            if i > 10:
                break
            user_id = int(user["user-id"])
            member = self.bot.get_user(user_id)
            if member:
                embed.add_field(
                    name=f"{i}. {member.name}", value=f"Level {user['level']} with {user['experience']} experience.", inline=False)
                i += 1
        await ctx.reply(embed=embed)

    @commands.check(is_dev)
    @commands.hybrid_command(name="addxp", description="Adds experience to a user. (Bot dev only)", with_app_command=True)
    async def addxp(self, ctx: commands.Context, member: discord.Member, amount: int):
        if amount < 0:
            raise commands.BadArgument("Amount must be greater than 0.")
        await self.process_xp_gain(member, amount)
        await ctx.reply(f"Added {amount} experience to {member.mention}.", allowed_mentions=discord.AllowedMentions.none())

    @commands.check(is_dev)
    @commands.hybrid_command(name="addlvl", description="Adds levels to a user. (Bot dev only)", with_app_command=True)
    async def addlvl(self, ctx: commands.Context, member: discord.Member, amount: int):
        if amount < 0:
            raise commands.BadArgument("Amount must be greater than 0.")

        key = {
            "user-id": str(member.id)
        }

        user_data = await self.collection.find_one(key)

        if user_data:
            level = user_data["level"]
            new_experience = 0
            new_level = level
            while (amount + level) > new_level:
                new_experience += calculate_level(new_level, 0)
                new_level += 1

        else:
            new_experience = 0
            new_level = 0
            while (amount + level) > calculate_level(new_level, 0):
                new_experience += calculate_level(new_level, 0)
                new_level += 1

        await self.process_xp_gain(member, new_experience)
        await ctx.reply(f"Added {amount} levels to {member.mention}.", allowed_mentions=discord.AllowedMentions.none())

    @commands.check(is_dev)
    @commands.hybrid_command(name="setxp", description="Sets experience to a user. (Bot dev only)", with_app_command=True)
    async def setxp(self, ctx: commands.Context, member: discord.Member, amount: int):
        await self.process_xp_set(member, experience=amount)
        await ctx.reply(f"Set {amount} experience to {member.mention}.", allowed_mentions=discord.AllowedMentions.none())

    @commands.check(is_dev)
    @commands.hybrid_command(name="setlvl", description="Sets levels to a user. (Bot dev only)", with_app_command=True)
    async def setlvl(self, ctx: commands.Context, member: discord.Member, amount: int):
        await self.process_xp_set(member, level=amount)
        await ctx.reply(f"Set {amount} levels to {member.mention}.", allowed_mentions=discord.AllowedMentions.none())


async def setup(bot):
    await bot.add_cog(Leveling(bot))
