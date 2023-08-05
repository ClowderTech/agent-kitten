import discord
from discord.ext import commands
import aiohttp
import googlesearch
import aiofiles
import typing
import os
import datetime
import json


class TextGen(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.collection = self.bot.database["text-gen"]
        self.search_results_amount = 1
        self.chat_instructions = [
            {
                "role": "system",
                "content": "You are Agent Kitten, a helpful AI assistant made by the ClowderTech Corperation. You are here to help people with their problems."
            }
        ]

    async def get_textgen_response(self, message: typing.List[typing.Dict[str, str]]):
        async with aiohttp.ClientSession() as session:
            async with session.post("http://172.16.237.83:8000/api/v1/textgen", json={"message": message}) as response:
                if response.ok:
                    result = await response.json()
                    return result["response"]
                else:
                    return None
                
    @commands.hybrid_command(name="chat", description="Chat with Agent Kitten.", with_app_command=True)
    async def chat(self, ctx: commands.Context, search: typing.Optional[bool], *, message: str):
        await ctx.defer()
        key = {
            "user-id": str(ctx.author.id)
        }
        user_instructions = await self.collection.find_one(key)
        if user_instructions:
            instruction = user_instructions["instruction"]
        else:
            instruction = self.chat_instructions
        if search:
            search_results = ""
            search_term = await self.get_textgen_response([{"role": "system", "content": "Generate a search term for the user to put into google that would answer the user's question."}, {"role": "user", "content": f"Generate a search term that I can put into google and answer my question. \"{message}\""}])
            if search_term is None:
                raise commands.CommandError("Something went wrong with the textgen API.")
            index = 1
            for result in googlesearch.search(search_term, advanced=True, num_results=self.search_results_amount):
                search_results += f", [{index}] \"{result.description}\" ({result.url})"
                index += 1
                if index >= self.search_results_amount + 1:
                    break
            search_results = search_results[2:]
            instruction.append({"role": "user", "content": f"{message}\n\nRelated Search Results:\n{search_results}"})
        else:
            instruction.append({"role": "user", "content": f"{message}"})
        result = await self.get_textgen_response(instruction)
        if result is None:
            raise commands.CommandError("Something went wrong with the textgen API.")
        instruction.append({"role": "assistant", "content": result})
        data = {
            "$set": {
                "instruction": instruction
            }
        }
        await self.collection.update_one(key, data, upsert=True)
        embed = discord.Embed(
            title="Response",
            description=result[:4095],
            color=discord.Color.blue(),
            timestamp=datetime.datetime.now()
        ).set_footer(
            text="If the responce doesnt seem right, use `/chatclear` and retype your question(s). If that doesn\'t work, Report it in my support server with the data from your `/rawchat`."
        ).set_author(
            name=ctx.author.name,
            icon_url=ctx.author.avatar.url
        )
        await ctx.reply(embed=embed)

    @commands.hybrid_command(name="chatclear", description="Clear your current conversation with Agent Kitten.",
                             with_app_command=True)
    async def chatclear(self, ctx: commands.Context):
        key = {
            "user-id": str(ctx.author.id)
        }
        await self.collection.delete_one(key)
        await ctx.reply(f"I have deleted your conversation with me, {ctx.author.mention}.")

    @commands.hybrid_command(name="rawchat",
                             description="Check raw conversation data with Agent Kitten. (Meant for debugging)",
                             with_app_command=True)
    async def rawchat(self, ctx: commands.Context):
        key = {
            "user-id": str(ctx.author.id)
        }
        user_instructions = await self.collection.find_one(key)
        if user_instructions:
            instruction = json.dumps(json.load(user_instructions["instruction"]), indent=4)
            async with aiofiles.open(f"{ctx.author.id}.txt", mode="wb") as file:
                await file.write(bytes(instruction, 'utf8'))
            await ctx.reply(
                f"Here is my chat data with you, {ctx.author.mention}.",
                file=discord.File(f"{ctx.author.id}.txt"))
            os.remove(f"{ctx.author.id}.txt")
        else:
            await ctx.reply(f"I have no chat data with you, {ctx.author.mention}.")
        

async def setup(bot):
    await bot.add_cog(TextGen(bot))