import discord
from discord.ext import tasks, commands
import math
import random
import asyncio


def calculate(level, experience):
    return (3 * (level ** 2) + (20 * level) + 100) - experience


class Leveling(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.collection = self.bot.database["leveling"]
        self.user_talked = []
        self.bg_task = self.bot.loop.create_task(self.talking_reset())
        self.bg_task2 = self.bot.loop.create_task(self.check_voice_talking())


    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot:
            return
        elif message.author.id not in self.user_talked:
            self.user_talked.append(message.author.id)
            points =int(round(random.random() * 4) + 1)
            key = {
                "user-id": str(message.author.id)
            }

            user_data = await self.collection.find_one(key)

            if user_data:
                level = user_data["level"]
                experience = user_data["experience"]
                new_experience = experience + points
                new_level = level
                if new_experience >= calculate(new_level, 0):
                    new_experience -= calculate(new_level, 0)
                    new_level += 1
                    await message.author.send(f"You are now level {new_level}!")
                data = {
                    "$set": {
                        "level": new_level,
                        "experience": new_experience
                    }
                }
                await self.collection.update_one(key, data, upsert=True)
            else:
                data = {
                    "user-id": str(message.author.id),
                    "level": 0,
                    "experience": points
                }
                await self.collection.insert_one(data)

    async def talking_reset(self):
        await self.bot.wait_until_ready()
        while not self.bot.is_closed():
            await asyncio.sleep(60)
            self.user_talked = []

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
                elif member.id not in self.user_talked:
                    self.user_talked.append(member.id)
                    points = int(round(random.random() * 4) + 1)
                    key = {
                        "user-id": str(member.id)
                    }

                    user_data = await self.collection.find_one(key)

                    if user_data:
                        level = user_data["level"]
                        experience = user_data["experience"]
                        new_experience = experience + points
                        new_level = level
                        if new_experience >= calculate(new_level, 0):
                            new_experience -= calculate(new_level, 0)
                            new_level += 1
                            await member.send(f"You are now level {new_level}!")
                        data = {
                            "$set": {
                                "level": new_level,
                                "experience": new_experience
                            }
                        }
                        await self.collection.update_one(key, data, upsert=True)
                    else:
                        data = {
                            "user-id": str(member.id),
                            "level": 0,
                            "experience": points
                        }
                        await self.collection.insert_one(data)




    @commands.hybrid_command(name="level", description="Pulls your level and experience.", with_app_command=True)
    async def level(self, ctx: commands.Context):
        key = {
            "user-id": str(ctx.author.id)
        }
        user_data = await self.collection.find_one(key)
        if user_data:
            level = user_data["level"]
            experience = user_data["experience"]
            await ctx.reply(f"{ctx.author.mention}, you are level {level} with {experience} experience.")
        else:
            await ctx.reply(f"{ctx.author.mention}, you are level 0 with 0 experience.")


    @commands.hybrid_command(name="leaderboard", description="Pulls the top 10 users with the most experience.", with_app_command=True)
    async def leaderboard(self, ctx: commands.Context):
        users = self.collection.find().sort([("level", -1), ("experience", -1)])
        embed = discord.Embed(title="Leaderboard", color=discord.Color.blurple())
        i = 1
        async for user in users:
            if i > 10:
                break
            user_id = int(user["user-id"])
            member = self.bot.get_user(user_id)
            if member:
                embed.add_field(name=f"{i}. {member.name}", value=f"Level {user['level']} with {user['experience']} experience.", inline=False)
                i += 1
        await ctx.reply(embed=embed)


async def setup(bot):
    await bot.add_cog(Leveling(bot))