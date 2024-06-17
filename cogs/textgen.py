import discord
from discord.ext import commands
import aiohttp
import googlesearch
import aiofiles
import typing
import os
import datetime
import json
import openai
import cloudscraper
from bs4 import BeautifulSoup
from contextlib import redirect_stdout
import urllib
import random
import asyncio


async def is_dev(ctx):
    guild = ctx.bot.get_guild(1157440778000420974)
    member = guild.get_member(ctx.author.id)
    if member is None:
        return False
    roles = [guild.get_role(1240471128779259914)]
    if any(role in member.roles for role in roles):
        return True
    return False


class TextGen(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.collection = self.bot.database["text-gen"]
        self.search_results_amount = 3
        self.chat_instructions = [
            {"role": "system",
             "content":
             "You are Agent Kitten, a helpful AI powered discord bot made by the ClowderTech LLC. You are here to help people with their problems."}]
        self.useragent_list = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:66.0) Gecko/20100101 Firefox/66.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.1661.62',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0']

    async def search_google(self, query: str):
        async with aiohttp.ClientSession(headers={
            "User-Agent": random.choice(self.useragent_list)
        }) as session:
            search_results = ""
            escaped_term = urllib.parse.quote_plus(query)
            start = 0
            async with session.get(f"https://searx.clowdertech.com/search?q={escaped_term}&language=auto&time_range=&safesearch=0&categories=general&format=json") as response:
                if not response.ok:
                    return f"Responce not ok. {response.status}"
                results = await response.json()
                results = results["results"]
                for result in results:
                    search_results += f"[{start + 1}] {result['url']} || {result["content"]}\n"
                    start += 1
                    if start == self.search_results_amount:
                        break

            search_results = search_results[2:]
            return search_results

    async def scrape_website(self, url: str):
        async with aiohttp.ClientSession(headers={
            "User-Agent": random.choice(self.useragent_list)
        }) as session:
            async with session.get(url) as response:
                text = await response.text()
                soup = BeautifulSoup(text, "html.parser")
                text = soup.get_text()
                return text

    async def python_eval(self, code: str):
        new_code = f"async def __ex(bot):\n\twith open(\"eval_output.txt\", \"w\") as file:\n\t\twith redirect_stdout(file):\n\t\t\t" + \
            "".join([f"\n\t\t\t{line}" for line in code.replace(
                "\n", r"\n").split(r"\n")])
        compiled = compile(new_code, "<string>", "exec")
        exec(compiled, globals(), locals())

        await locals()["__ex"](self.bot)

        with open("eval_output.txt", "r") as file:
            output = file.read()
            if len(output) == 0:
                output = "No output."

        return output

    def split_text(text, max_length=4096):
        """
        Splits text into chunks, ensuring each chunk is no longer than max_length
        and splits are done only at newline characters while preserving markdown formatting.

        :param text: The text to be split
        :param max_length: Maximum length of each split chunk
        :return: A list of text chunks
        """
        # Split the text by lines first
        lines = text.splitlines(True)  # True keeps the newline characters

        chunks = []
        current_chunk = ""

        for line in lines:
            # Check if adding the line would make the current chunk too long
            if len(current_chunk) + len(line) > max_length:
                chunks.append(current_chunk.strip())
                current_chunk = line
            else:
                current_chunk += line

        # Add the last chunk if it has content
        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        return chunks

    async def get_textgen_response(
            self, message: typing.List[typing.Dict[str, str]],
            tools: typing.List[typing.Dict] = None):
        # async with aiohttp.ClientSession() as session:
        #     async with session.post("http://172.16.237.83:8000/api/v1/textgen", json={"message": message}) as response:
        #         if response.ok:
        #             result = await response.json()
        #             return result["response"]
        #         else:
        #             return None
        response = await self.bot.openai.chat.completions.create(model="gpt-4o", messages=message, tools=tools, tool_choice="auto")
        return response.model_dump(exclude_unset=True)["choices"][0]["message"]

    async def get_response(self, message: str, user_id: str,
                           tools: typing.List[typing.Dict] = None,
                           avaliable_functions: typing.Dict
                           [str, typing.Callable] = None):
        user_instruction_data = await self.collection.find_one({
            "user_id": str(user_id)
        })
        if user_instruction_data:
            user_instruction = user_instruction_data["instruction"]
        else:
            user_instruction = self.chat_instructions.copy()
        user_instruction.append({"role": "user", "content": f"{message}"})
        result = await self.get_textgen_response(user_instruction, tools)
        if result is None:
            raise commands.CommandError(
                "Something went wrong with the textgen API.")
        tool_calls = result.get("tool_calls", None)
        while tool_calls is not None:
            user_instruction.append(result)
            for tool_call in result["tool_calls"]:
                function_name = tool_call["function"]["name"]
                function_to_call = avaliable_functions[function_name]
                function_args = json.loads(tool_call["function"]["arguments"])
                response = await function_to_call(**function_args)
                user_instruction.append(
                    {"tool_call_id": tool_call["id"],
                     "role": "tool", "name": function_name,
                     "content": response})
            result = await self.get_textgen_response(user_instruction, tools)
            if result is None:
                raise commands.CommandError(
                    "Something went wrong with the textgen API.")
            tool_calls = result.get("tool_calls", None)
        user_instruction.append(result)
        test_for_existance = await self.collection.find_one({
            "user_id": str(user_id)
        })
        if test_for_existance:
            await self.collection.update_one({
                "user_id": str(user_id)
            }, {
                "$set": {
                    "instruction": user_instruction
                }
            })
        else:
            await self.collection.insert_one({
                "user_id": str(user_id),
                "instruction": user_instruction
            })
        return result

    @commands.hybrid_command(name="chat",
                             description="Chat with Agent Kitten.",
                             with_app_command=True)
    async def chat(self, ctx: commands.Context, *, message: str):
        await ctx.defer()

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "search_google",
                    "description": "Search Google for the given query.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "The query to search for."
                            },
                        },
                        "required": ["query"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "scrape_website",
                    "description": "Scrape a website for all of its text.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "url": {
                                "type": "string",
                                "description": "The url to scrape."
                            },
                        },
                        "required": ["url"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "python_eval",
                    "description": "Execute python code. Make sure to not use any infinite loops, code that could harm your computer, and access senstive data. Make sure to use print() to get output.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "code": {
                                "type": "string",
                                "description": "The code to execute."
                            },
                        },
                        "required": ["code"],
                    },
                },
            }
        ]

        avaliable_functions = {
            "search_google": self.search_google,
            "scrape_website": self.scrape_website,
            "python_eval": self.python_eval
        }

        if ctx.author.avatar is None:
            avatar_url = ctx.author.default_avatar.url
        else:
            avatar_url = ctx.author.avatar.url

        result = await self.get_response(message, ctx.author.id, tools=tools, avaliable_functions=avaliable_functions)

        results = self.split_text(result["content"])
        embeds = []
        for result_piece in results:
            embeds.append(
                discord.Embed(
                    title="Response",
                    description=result_piece,
                    color=discord.Color.purple(),
                    timestamp=datetime.datetime.now()
                ).set_footer(
                    text=""
                ).set_author(
                    name=ctx.author.name,
                    icon_url=avatar_url
                )
            )
        await ctx.reply(embeds=embeds)

    @commands.hybrid_command(name="chatclear",
                             description="Clear your current conversation with Agent Kitten.",
                             with_app_command=True)
    async def chatclear(self, ctx: commands.Context):
        await self.collection.delete_one({
            "user_id": str(ctx.author.id)
        })
        await ctx.reply(f"I have deleted your conversation with me, {ctx.author.mention}.")

    @commands.check(is_dev)
    @commands.hybrid_command(
        name="chatraw",
        description="Check raw conversation data with Agent Kitten. (Meant for debugging)",
        with_app_command=True)
    async def chatraw(self, ctx: commands.Context, user: discord.User = None):
        if user is None:
            user = ctx.author
        sendable_instructions = await self.collection.find_one({
            "user_id": str(user.id)
        })
        if sendable_instructions:
            instruction = json.dumps(
                sendable_instructions["instruction"], indent=4)
            await ctx.reply(
                f"Here is my chat data with {user.mention}.",
                file=discord.File(bytes(instruction, 'utf8'),
                                  filename=f"{ctx.author.id}.json")
            )
        else:
            await ctx.reply(f"I have no chat data with {user.mention}.")


async def setup(bot):
    await bot.add_cog(TextGen(bot))
