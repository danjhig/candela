/** @typedef { import('discord.js') } Guild */
/** @typedef { import('discord.js').Message } Message */
/** @typedef { import('discord.js').Role } Role */
/** @typedef { import('discord.js').TextChannel } TextChannel */

const Discord = require('discord.js')
const client = new Discord.Client()

const GYM_MEMBERSHIP = 'gym-membership'
const SUBSCRIBE_EMOJI = '🔔'
const UNSUBSCRIBE_EMOJI = '🔕'
const WELCOME_MESSAGE =
  `Hi Trainers — Candela here! I’m here to help make sure you don’t miss out on raids at nearby gyms.\n\n` +
  `Group administrators can add gyms at any time by telling me the names of the gym in this channel. Only 1 gym per line please!\n\n` +
  `If you want to subscribe to notifications for a gym, tap the ${SUBSCRIBE_EMOJI} symbol beneath it. If you later want to unsubscribe, tap the ${UNSUBSCRIBE_EMOJI} symbol.\n\n` +
  `When someone **@mentions** a gym that you are subscribed to, you will get a notification. That way you’ll never miss a raid there!\n\n` +
  `If you want to see all of the gyms that you subscribe to, find your name in the list of members for this group and tap on it. That will show you your profile, which has all of your subscribed gyms listed as roles.\n\n` +
  `That’s all there is to it! Good luck in all your battles — I know you’ll do great!\n\n`

client.on('ready', () => {
  client.guilds.tap(guild => initGuild(guild))
  console.log('Ready.')
})

client.on('guildCreate', guild => {
  initGuild(guild)
})

client.on('message', async message => {
  if (!shouldListen(message) || (message.author.id === client.user.id)) {
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
      const roleMessage = await message.channel.send(`<@&${role.id}>`)
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
  if (!shouldListen(message) || (message.author.id !== client.user.id) || (user.id === client.user.id)) {
    return
  }
  await messageReaction.remove(user)
  const role = message.mentions.roles.first()
  if (!role) {
    return
  }
  const { guild } = message
  const member = guild.member(user)
  const response = text => `**${role.name}**\n_${guild.name}_\n${text}`
  try {
    const emojiString = emoji.toString()
    if (emojiString === SUBSCRIBE_EMOJI) {
      await member.addRole(role)
      await user.send(response(`${SUBSCRIBE_EMOJI} subscribed`))
    } else if (emojiString === UNSUBSCRIBE_EMOJI) {
      await member.removeRole(role)
      await user.send(response(`${UNSUBSCRIBE_EMOJI} unsubscribed`))
    }
  } catch (e) {
    console.warn(e)
    user.send(response(
      `Oh, sorry! It looks like I am not able to subscribe or unsubscribe people from this gym. ` +
      `A group administrator needs to allow me to manage the _${role.name}_ role to proceed.`
    ))
  }
})

/**
 * @param {Guild} guild
 */
async function initGuild (guild) {
  const gymMembershipChannel = await getOrCreateGymMembershipChannel(guild)
  // Fetching messages has the important side effect of caching old gym messages.
  const messages = await gymMembershipChannel.fetchMessages()
  const candelaMessages = messages.filter(message => message.author.id === client.user.id)
  if (candelaMessages.size === 0) {
    gymMembershipChannel.send(WELCOME_MESSAGE)
  }
}

/**
 * @param {Guild} guild
 * @returns {TextChannel}
 */
async function getOrCreateGymMembershipChannel (guild) {
  const channel = guild.channels.find(channel => channel.name === GYM_MEMBERSHIP)
  if (channel) {
    return channel
  } else {
    const botOnlyPermissions = ['SEND_MESSAGES', 'ADD_REACTIONS']
    return guild.createChannel(GYM_MEMBERSHIP, {
      permissionOverwrites: [
        { id: guild.id, deny: botOnlyPermissions },
        { id: client.user.id, allow: botOnlyPermissions }
      ]
    })
  }
}

/**
 * @param {Guild} guild
 * @param {string} gym
 * @returns {Role}
 */
async function getOrCreateGymRole (guild, gym) {
  const role = guild.roles.find(role => role.name === gym)
  if (role) {
    return role
  } else {
    return guild.createRole({
      name: gym,
      mentionable: true,
      permissions: 0
    })
  }
}

/**
 * @param {Message} message
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

client.login(process.env.TOKEN)
