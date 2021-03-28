const Discord = require('discord.js')
const client = new Discord.Client({ fetchAllMembers: true })

const GYM_MEMBERSHIP = 'gym-membership'
const SUBSCRIBE_EMOJI = '🔔'
const UNSUBSCRIBE_EMOJI = '🔕'
const WELCOME_MESSAGE =
  `Hi Trainers — Candela here! I’m here to help make sure you don’t miss out on raids at nearby gyms.\n\n` +
  `Group administrators can add gyms at any time by telling me the names of the gym in this channel. Only 1 gym per line please!\n\n` +
  `If you want to subscribe to notifications for a gym, tap the ${SUBSCRIBE_EMOJI} symbol beneath it. If you later want to unsubscribe, tap the ${UNSUBSCRIBE_EMOJI} symbol.\n\n` +
  `When someone **@mentions** a gym that you are subscribed to, you will get a notification. That way you’ll never miss a raid there!\n\n` +
  `If you want to see all of the gyms that you subscribe to, find your name in the list of members for this group and tap on it. That will show you your profile, which has all of your subscribed gyms listed as roles.\n\n` +
  `That’s all there is to it! Good luck in all your battles — I know you’ll do great!`

client.on('ready', () => {
  client.guilds.cache.tap(async guild => setupGuilds(guild))
  console.log('Candela is ready.')
})

client.on('guildCreate', async guild => {
  await initGuild(guild)
})

client.on('message', async message => {
  if (!shouldListen(message) || (message.author.id === client.user.id) || (message.author.username === client.user.username)) {
    return
  }
  await message.delete()
  if (!message.member.hasPermission('ADMINISTRATOR')) {
    await message.author.send(
      `Oops, sorry! You don't have permission to create gyms in **${message.guild.name}**. ` +
      `Only administrators can do that!`
    )
    return
  }
  const gyms = message.content.split('\n').map(name => name.trim()).filter(name => !!name)
  for (const gym of gyms) {
    const role = await getOrCreateGymRole(message.guild, gym)
    if (role.mentionable) {
      const roleMessage = await message.channel.send(roleMessageContent(role))
      await roleMessage.react(SUBSCRIBE_EMOJI)
      await roleMessage.react(UNSUBSCRIBE_EMOJI)
    } else {
      await message.channel.send(
        `Hmm. A role called **${gym}** already exists and is not mentionable. ` +
        `If you're sure that you  want to add a gym with that name, ` +
        `either delete that role or make it mentionable then try me again.`
      )
    }
  }
})

client.on('messageReactionAdd', async (messageReaction, user) => {
  const { message, emoji } = messageReaction
  if (!shouldListen(message) || ((message.author.id !== client.user.id) && (message.author.username !== client.user.username)) || (user.id === client.user.id)) {
    return
  }
  await (messageReaction.message.reactions.cache.first().users.remove(user.id) && messageReaction.message.reactions.cache.last().users.remove(user.id))
  const role = message.mentions.roles.first()
  if (!role) {
    return
  }
  const { guild } = message
  const member = guild.member(user.id)
  const emojiString = emoji.toString()
  if (emojiString === SUBSCRIBE_EMOJI) {
    try {
      await member.roles.add(role)
    } catch (e) {
      console.warn(e)
      message.channel.send(`Failed to subscribe <@${user.id}> to **${role.name}**.`)
    }
  } else if (emojiString === UNSUBSCRIBE_EMOJI) {
    try {
      await member.roles.remove(role)
    } catch (e) {
      console.warn(e)
      message.channel.send(`Failed to unsubscribe <@${user.id}> from **${role.name}**.`)
    }
  }
  if (message.author.id !== client.user.id) {
    await message.delete()
    const roleMessage = await message.channel.send(roleMessageContent(role))
    await roleMessage.react(SUBSCRIBE_EMOJI)
    await roleMessage.react(UNSUBSCRIBE_EMOJI)
  } else {
    await message.edit(roleMessageContent(role))
  }
})

/**
 * @param {Discord.Guild} guild
 */
function setupGuilds (guild) {
  guild.forEach(guild => initGuild(guild))
}

/**
 * @param {Discord.Guild} guild
 */
async function initGuild (guild) {
  const gymMembershipChannel = await getOrCreateGymMembershipChannel(guild)
  // Fetching messages has the important side effect of caching old gym messages.
  const messages = await gymMembershipChannel.messages.fetch()
  const candelaMessages = messages.filter(message => message.author.id === client.user.id || message.author.username === client.user.username)
  if (candelaMessages.size === 0) {
    try {
      await gymMembershipChannel.send(WELCOME_MESSAGE)
    } catch (e) {
      console.log(e)
    }
  }
}

/**
 * @param {Discord.Role} role
 * @returns {string}
 */
function roleMessageContent (role) {
  const { members } = role
  const membersList = members.map(member => `<@${member.id}>`).join(', ')
  return `**Gym:**\n` +
    `<@&${role.id}>\n` +
    `**Subscribers (${members.size}):**\n` +
    `${membersList || 'None'}`
}

/**
 * @param {Discord.Guild} guild
 * @returns {Promise<Discord.TextChannel>}
 */
async function getOrCreateGymMembershipChannel (guild) {
  const channel = guild.channels.cache.find(channel => channel.name === GYM_MEMBERSHIP)
  const botOnlyPermissions = ['SEND_MESSAGES', 'ADD_REACTIONS']
  if (channel) {
    channel.overwritePermissions([
      { id: guild.id, deny: botOnlyPermissions },
      { id: client.user.id, allow: botOnlyPermissions }
    ], 'Ensure permissions are correct')
    return channel
  } else {
    return guild.channels.create(GYM_MEMBERSHIP, {
      type: 'text',
      permissionOverwrites: [
        { id: guild.id, deny: botOnlyPermissions },
        { id: client.user.id, allow: botOnlyPermissions }
      ]
    })
  }
}

/**
 * @param {Discord.Guild} guild
 * @param {string} gym
 * @returns {Promise<Discord.Role>}
 */
async function getOrCreateGymRole (guild, gym) {
  const role = guild.roles.cache.find(role => role.name === gym)
  if (role) {
    return role
  } else {
    return guild.roles.create({
      data: {
        name: gym,
        permissions: 0,
        mentionable: true
      }
    })
  }
}

/**
 * @param {Discord.Message} message
 * @returns {boolean}
 */
function shouldListen (message) {
  const { channel } = message
  if ((channel.type !== 'text') || (channel.name !== GYM_MEMBERSHIP)) {
    return false
  }
  const isProduction = this.process.env.ENV === 'production'
  const isTestGuild = message.guild && (message.guild.id === this.process.env.TEST_GUILD)
  return (isProduction && !isTestGuild) || (!isProduction && isTestGuild)
}

module.exports = client
