import discord
from discord.ext import tasks, commands
import math
import random
import asyncio
import typing


def calculate_level(level, experience):
    return round(level ** 2) + (10 * level) + 100 - experience


def calculate_experience_gain():
    xp_gain = random.uniform(1, 5)

    if random.random() < 0.05:
        bonus_xp = random.uniform(5, 25)
        xp_gain += bonus_xp

    return round(xp_gain)


async def is_dev(ctx):
    guild = ctx.bot.get_guild(1157440778000420974)
    member = guild.get_member(ctx.author.id)
    if member is None:
        return False
    roles = [guild.get_role(1240471128779259914)]
    if any(role in member.roles for role in roles):
        return True
    return False


class Leveling(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.collection = self.bot.database["leveling"]
        self.opt_collection = self.bot.database["feature-opt"]
        self.text_user_talked = []
        self.check_voice_talking.start()

    async def level_up_message(self, user: discord.User, level: int):
        try:
            embed = discord.Embed(
                title="Level Up!",
                description=f"Congratulations, {
                    user.mention}! You are now level {level}!",
                color=discord.Color.green())

            embed.set_footer(
                text="You can opt out of these messages by using the opt command.")

            await user.send(embed=embed, allowed_mentions=discord.AllowedMentions.none(), silent=True)
        except discord.Forbidden:
            pass

    async def level_set_message(
            self,
            user: discord.User,
            level: int,
            experience: int):
        try:
            embed = discord.Embed(
                title="Level Update.",
                description=f"Hello, {
                    user.mention}! An administrator has set your level to {level} and experience to {experience}!",
                color=discord.Color.green())

            embed.set_footer(
                text="You can opt out of these messages by using the opt command.")

            await user.send(embed=embed, allowed_mentions=discord.AllowedMentions.none(), silent=True)
        except discord.Forbidden:
            pass

    async def update_user_data(self, key, new_level, new_experience):
        data = {
            "$set": {
                "level": new_level,
                "experience": new_experience
            }
        }
        await self.collection.update_one(key, data)

    async def insert_user_data(self, key, new_level, new_experience):
        data = {
            "user_id": key["user_id"],
            "level": new_level,
            "experience": new_experience
        }
        await self.collection.insert_one(data)

    async def process_experience_gain(self, user, level, experience, points):
        new_experience = experience + points
        new_level = level
        while new_experience >= calculate_level(new_level, 0):
            new_experience -= calculate_level(new_level, 0)
            new_level += 1
        return new_level, new_experience

    async def handle_level_up_message(self, user, new_level, opted_message):
        if opted_message.get("level_up_messaging", True):
            await self.level_up_message(user, new_level)

    async def handle_level_set_message(self, user, level, experience, opted_message):
        if opted_message.get("level_up_messaging", True):
            await self.level_set_message(user, level, experience)

    async def get_user_data(self, key):
        return await self.collection.find_one(key)

    async def get_opted_message(self, key):
        opted_message = await self.opt_collection.find_one(key)
        return opted_message if opted_message else {}

    async def process_xp_gain(self, user: discord.User, points: int = None):
        if points is None:
            points = self.calculate_experience_gain()

        key = {"user_id": str(user.id)}
        user_data = await self.get_user_data(self, key)
        opted_message = await self.get_opted_message(self, key)

        if user_data:
            level = user_data["level"]
            experience = user_data["experience"]
        else:
            level = 0
            experience = 0

        new_level, new_experience = await self.process_experience_gain(self, user, level, experience, points)

        if new_level > level:
            await self.handle_level_up_message(self, user, new_level, opted_message)

        if user_data:
            await self.update_user_data(self, key, new_level, new_experience)
        else:
            await self.insert_user_data(self, key, new_level, new_experience)

    async def process_xp_set(self, user: discord.User, level: int = None, experience: int = None):
        key = {"user_id": str(user.id)}
        user_data = await self.get_user_data(self, key)
        opted_message = await self.get_opted_message(self, key)

        if not user_data:
            data_level = level if level is not None else 0
            data_experience = experience if experience is not None else 0
            await self.insert_user_data(self, key, data_level, data_experience)
        else:
            if level is None:
                level = user_data["level"]
            if experience is None:
                experience = user_data["experience"]

            await self.update_user_data(self, key, level, experience)

            await self.handle_level_set_message(self, user, level, experience, opted_message)

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot:
            return
        elif message.author.id not in self.text_user_talked:
            self.text_user_talked.append(message.author.id)
            await self.process_xp_gain(message.author)

    @tasks.loop(minutes=1)
    async def check_voice_talking(self):
        self.text_user_talked = []
        channels = list(self.bot.get_all_channels())
        for voice_channel in [
                channel for channel in channels
                if channel.type == discord.ChannelType.voice or channel.type
                == discord.ChannelType.stage_voice]:
            members = voice_channel.members
            if len(members) <= 1:
                continue
            for member in members:
                if member.voice.self_mute or member.voice.self_deaf:
                    continue
                elif member.voice.afk:
                    continue
                elif member.voice.mute or member.voice.deaf:
                    continue
                elif member.bot:
                    continue
                else:
                    await self.process_xp_gain(member)

    @commands.hybrid_command(name="level",
                             description="Pulls your level and experience.",
                             with_app_command=True)
    async def level(self, ctx: commands.Context,
                    member_to_check: typing.Optional[discord.User]):
        if member_to_check is None:
            member_to_check = ctx.author
        else:
            member_to_check = member_to_check
        key = {
            "user_id": str(member_to_check.id)
        }
        user_data = await self.collection.find_one(key)
        if user_data:
            level = user_data["level"]
            experience = user_data["experience"]
            await ctx.reply(f"{member_to_check.mention} is level {level} with {experience} experience. They need {calculate_level(level, experience)} more experience points to level up.", allowed_mentions=discord.AllowedMentions.none())
        else:
            await ctx.reply(f"{member_to_check.mention} does not have any data.", allowed_mentions=discord.AllowedMentions.none())

    @commands.hybrid_command(name="leaderboard",
                             description="Pulls the top 10 users with the most experience.",
                             with_app_command=True)
    async def leaderboard(self, ctx: commands.Context):
        users = self.collection.find().sort(
            [("level", -1), ("experience", -1)])
        embed = discord.Embed(title="Leaderboard",
                              color=discord.Color(0x3498DB))
        i = 1
        description = ""
        async for user in users:
            if i > 10:
                break
            user_id = int(user["user_id"])
            member = self.bot.get_user(user_id)
            if member:
                description += f"{i}. {member.mention}\nLevel {
                    user['level']} with {user['experience']} experience.\n\n"
                i += 1
        embed = discord.Embed(title="Leaderboard", color=discord.Color(
            0x3498DB), description=description)
        await ctx.reply(embed=embed)

    @commands.check(is_dev)
    @commands.hybrid_command(name="addxp",
                             description="Adds experience to a user. (Bot dev only)",
                             with_app_command=True,
                             guild_id=1185316093078802552)
    async def addxp(
            self,
            ctx: commands.Context,
            member: discord.Member,
            amount: int):
        if amount < 0:
            raise commands.BadArgument("Amount must be greater than 0.")
        await self.process_xp_gain(member, amount)
        await ctx.reply(f"Added {amount} experience to {member.mention}.", allowed_mentions=discord.AllowedMentions.none())

    @commands.check(is_dev)
    @commands.hybrid_command(name="addlvl",
                             description="Adds levels to a user. (Bot dev only)",
                             with_app_command=True,
                             guild_id=1185316093078802552)
    async def addlvl(
            self,
            ctx: commands.Context,
            member: discord.User,
            amount: int):
        if amount < 0:
            raise commands.BadArgument("Amount must be greater than 0.")

        key = {
            "user_id": str(member.id)
        }

        user_data = await self.collection.find_one(key)

        level = user_data["level"] if user_data else 0
        new_experience = 0
        new_level = level
        while (amount + level) > new_level:
            new_experience += calculate_level(new_level, 0)
            new_level += 1

        await self.process_xp_gain(member, new_experience)
        await ctx.reply(f"Added {amount} levels to {member.mention}.", allowed_mentions=discord.AllowedMentions.none())

    @commands.check(is_dev)
    @commands.hybrid_command(name="setxp",
                             description="Sets experience to a user. (Bot dev only)",
                             with_app_command=True,
                             guild_id=1185316093078802552)
    async def setxp(
            self,
            ctx: commands.Context,
            member: discord.Member,
            amount: int):
        await self.process_xp_set(member, experience=amount)
        await ctx.reply(f"Set {amount} experience to {member.mention}.", allowed_mentions=discord.AllowedMentions.none())

    @commands.check(is_dev)
    @commands.hybrid_command(name="setlvl",
                             description="Sets levels to a user. (Bot dev only)",
                             with_app_command=True,
                             guild_id=1185316093078802552)
    async def setlvl(
            self,
            ctx: commands.Context,
            member: discord.Member,
            amount: int):
        await self.process_xp_set(member, level=amount)
        await ctx.reply(f"Set {amount} levels to {member.mention}.", allowed_mentions=discord.AllowedMentions.none())


async def setup(bot):
    await bot.add_cog(Leveling(bot))
