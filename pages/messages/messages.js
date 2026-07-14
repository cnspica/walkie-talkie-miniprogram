// pages/messages/messages.js
Page({
  data: {
    messages: [],
    filteredMessages: [],
    filter: 'all'
  },

  onShow: function() {
    this.loadMessages();
  },

  loadMessages: function() {
    var messages = wx.getStorageSync('messageHistory') || [];
    this.setData({ messages: messages });
    this.applyFilter();
  },

  setFilter: function(e) {
    this.setData({ filter: e.currentTarget.dataset.filter });
    this.applyFilter();
  },

  applyFilter: function() {
    var filter = this.data.filter;
    var filtered = this.data.messages;

    if (filter === 'received') {
      filtered = messages.filter(function(m) { return !m.isSelf; });
    } else if (filter === 'sent') {
      filtered = messages.filter(function(m) { return m.isSelf; });
    }

    this.setData({ filteredMessages: filtered });
  },

  clearMessages: function() {
    var self = this;
    wx.showModal({
      title: '确认清空',
      content: '将删除所有消息记录，此操作不可恢复',
      success: function(res) {
        if (res.confirm) {
          wx.removeStorageSync('messageHistory');
          self.setData({ messages: [], filteredMessages: [] });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  }
});
